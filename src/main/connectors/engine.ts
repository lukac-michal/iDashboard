// ============================================================
// Connector Engine - Scheduler, lifecycle, polling orchestrator
// ============================================================

import { BaseConnector } from './base';
import { ClaudeCodeConnector } from './claude-code';
import { CursorConnector } from './cursor';
import { TeamCityConnector } from './teamcity';
import { OctopusDeployConnector } from './octopus-deploy';
import { GraylogConnector } from './graylog';
import { GitHubConnector } from './github';
import { SlackConnector } from './slack';
import { GenericHttpConnector } from './generic-http';
import { GenericPushConnector } from './generic-push';
import { CircuitBreaker } from '@main/services/circuit-breaker';
import { log, warn, error as logError } from '@main/utils/log';
import type { AuthManager } from '@main/services/auth-manager';
import type { ConnectorConfig, ConnectorEvent, ConnectorHealth, ConnectorStatus } from '@shared/types';
import { CONNECTOR_TYPES } from '@shared/constants';

type EventCallback = (event: ConnectorEvent) => void;

interface ManagedConnector {
  connector: BaseConnector;
  config: ConnectorConfig;
  circuitBreaker: CircuitBreaker;
  timer?: ReturnType<typeof setInterval>;
}

export class ConnectorEngine {
  private connectors = new Map<string, ManagedConnector>();
  private disabledConfigs = new Map<string, ConnectorConfig>();
  private eventCallbacks: EventCallback[] = [];
  private authManager: AuthManager;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
  }

  /** Subscribe to events from all connectors */
  onEvent(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  private emitEvent(event: ConnectorEvent): void {
    for (const cb of this.eventCallbacks) {
      try { cb(event); } catch (e) { logError('Engine', 'Event callback error:', e); }
    }
  }

  /** Start a connector from config (or park it if disabled) */
  async addConnector(config: ConnectorConfig): Promise<void> {
    // Disabled connector: stop if running, store config for display
    if (!config.enabled) {
      if (this.connectors.has(config.id)) {
        await this.removeConnector(config.id);
      }
      this.disabledConfigs.set(config.id, config);
      log('Engine', ` Connector disabled: ${config.id} (${config.type})`);
      return;
    }

    // Enabling: remove from disabled list
    this.disabledConfigs.delete(config.id);

    if (this.connectors.has(config.id)) {
      await this.removeConnector(config.id);
    }

    const connector = this.createConnector(config.type);
    if (!connector) {
      warn('Engine', ` Unknown connector type: ${config.type}`);
      return;
    }

    const requiresVpn = (config.settings.requiresVpn as boolean) ?? false;
    const circuitBreaker = new CircuitBreaker({ requiresVpn });

    const managed: ManagedConnector = { connector, config, circuitBreaker };
    this.connectors.set(config.id, managed);

    try {
      await connector.initialize(config, this.authManager);
      log('Engine', ` Initialized connector: ${config.id} (${config.type})`);
    } catch (err) {
      logError('Engine', ` Failed to initialize ${config.id}:`, err);
      circuitBreaker.recordFailure(String(err));
      return;
    }

    // Start polling for pull connectors
    if (connector.capabilities.includes('pull') && config.pollIntervalMs > 0) {
      this.startPolling(managed);
    }
  }

  /** Stop and remove a connector */
  async removeConnector(id: string): Promise<void> {
    this.disabledConfigs.delete(id);

    const managed = this.connectors.get(id);
    if (!managed) return;

    if (managed.timer) clearInterval(managed.timer);
    await managed.connector.destroy();
    this.connectors.delete(id);
    log('Engine', ` Removed connector: ${id}`);
  }

  /** Process an inbound push event */
  handlePushEvent(connectorId: string, rawEvent: unknown): ConnectorEvent | null {
    // Check for generic push connector type in the event
    const req = rawEvent as Record<string, unknown>;
    const targetConnector = req.connector as string ?? connectorId;

    // Find the matching connector
    let managed = this.connectors.get(targetConnector);

    // If not found by ID, find by type
    if (!managed) {
      for (const [, m] of this.connectors) {
        if (m.config.type === targetConnector || m.config.id === targetConnector) {
          managed = m;
          break;
        }
      }
    }

    // Fall back to generic push connector
    if (!managed) {
      for (const [, m] of this.connectors) {
        if (m.config.type === 'generic-push') {
          managed = m;
          break;
        }
      }
    }

    if (!managed || !managed.connector.normalizeInbound) {
      warn('Engine', ` No push handler for connector: ${targetConnector}`);
      return null;
    }

    try {
      const event = managed.connector.normalizeInbound(rawEvent);
      this.emitEvent(event);
      return event;
    } catch (err) {
      logError('Engine', ` Push event normalization failed:`, err);
      return null;
    }
  }

  /** Get status for all connectors (including disabled) */
  getStatuses(): ConnectorStatus[] {
    const active: ConnectorStatus[] = [...this.connectors.values()].map(m => {
      const status = m.connector.getStatus();
      status.enabled = true;
      status.health = m.circuitBreaker.getHealth();
      return status;
    });

    const disabled: ConnectorStatus[] = [...this.disabledConfigs.values()].map(c => ({
      id: c.id,
      type: c.type,
      displayName: c.displayName,
      enabled: false,
      connected: false,
      eventCount: 0,
    }));

    return [...active, ...disabled];
  }

  /** Get health for all connectors */
  getHealthMap(): Map<string, ConnectorHealth> {
    const map = new Map<string, ConnectorHealth>();
    for (const [id, m] of this.connectors) {
      map.set(id, m.circuitBreaker.getHealth());
    }
    return map;
  }

  /** Get a specific connector instance */
  getConnector(id: string): BaseConnector | undefined {
    return this.connectors.get(id)?.connector;
  }

  /** Get the full config for a connector (for editing in Settings UI) */
  getConnectorConfig(id: string): ConnectorConfig | undefined {
    return this.connectors.get(id)?.config ?? this.disabledConfigs.get(id);
  }

  /** Execute an action on a connector */
  async executeAction(connectorId: string, actionId: string, params?: unknown): Promise<void> {
    const managed = this.connectors.get(connectorId);
    if (!managed) throw new Error(`Connector not found: ${connectorId}`);
    await managed.connector.executeAction(actionId, params);
  }

  /** Replace all connectors with new configs (for hot-reload) */
  async reloadConnectors(configs: ConnectorConfig[]): Promise<void> {
    // Remove connectors that are no longer in config at all
    const newIds = new Set(configs.map(c => c.id));
    for (const id of [...this.connectors.keys()]) {
      if (!newIds.has(id)) await this.removeConnector(id);
    }
    for (const id of [...this.disabledConfigs.keys()]) {
      if (!newIds.has(id)) this.disabledConfigs.delete(id);
    }

    // Add/update connectors (addConnector handles enabled/disabled)
    for (const config of configs) {
      await this.addConnector(config);
    }
  }

  /** Destroy all connectors */
  async destroy(): Promise<void> {
    for (const id of [...this.connectors.keys()]) {
      await this.removeConnector(id);
    }
  }

  /** Force an immediate poll on a specific connector (bypasses interval timer) */
  async forcePoll(connectorId: string): Promise<ConnectorEvent[]> {
    const managed = this.connectors.get(connectorId);
    if (!managed) throw new Error(`Connector not found: ${connectorId}`);
    if (!managed.connector.capabilities.includes('pull')) {
      log('Engine', `Force poll skipped: ${connectorId} has no 'pull' capability`);
      return [];
    }

    log('Engine', `Force poll starting for: ${connectorId}`);
    try {
      const events = await managed.connector.poll();
      log('Engine', `Force poll completed for ${connectorId}: ${events.length} event(s)`);
      for (const event of events) {
        this.emitEvent(event);
      }
      managed.circuitBreaker.recordSuccess(0);
      return events;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError('Engine', `Force poll failed for ${connectorId}: ${msg}`);
      throw err;
    }
  }

  /** Pause all polling (e.g., when offline) */
  pauseAll(): void {
    for (const managed of this.connectors.values()) {
      if (managed.timer) {
        clearInterval(managed.timer);
        managed.timer = undefined;
      }
    }
  }

  /** Resume all polling */
  resumeAll(): void {
    for (const managed of this.connectors.values()) {
      if (managed.connector.capabilities.includes('pull') && managed.config.pollIntervalMs > 0) {
        this.startPolling(managed);
      }
    }
  }

  private startPolling(managed: ManagedConnector): void {
    if (managed.timer) clearInterval(managed.timer);

    const pollFn = async () => {
      if (!managed.circuitBreaker.shouldPoll()) return;

      const startTime = Date.now();
      try {
        const events = await managed.connector.poll();
        const latencyMs = Date.now() - startTime;

        managed.circuitBreaker.recordSuccess(latencyMs);

        for (const event of events) {
          this.emitEvent(event);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logError('Engine', ` Poll failed for ${managed.config.id}: ${errMsg}`);

        // Classify error
        let reachability: ConnectorHealth['reachability'] = 'http-failed';
        if (errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo')) {
          reachability = 'dns-failed';
        } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ETIMEDOUT')) {
          reachability = 'tcp-failed';
        } else if (errMsg.includes('401') || errMsg.includes('403')) {
          reachability = 'auth-failed';
        }

        managed.circuitBreaker.recordFailure(errMsg, reachability);
      }
    };

    // Poll immediately, then on interval
    pollFn();
    managed.timer = setInterval(pollFn, managed.config.pollIntervalMs);
  }

  private createConnector(type: string): BaseConnector | null {
    switch (type) {
      case CONNECTOR_TYPES.CLAUDE_CODE:
        return new ClaudeCodeConnector();
      case CONNECTOR_TYPES.CURSOR:
        return new CursorConnector();
      case CONNECTOR_TYPES.TEAMCITY:
        return new TeamCityConnector();
      case CONNECTOR_TYPES.OCTOPUS_DEPLOY:
        return new OctopusDeployConnector();
      case CONNECTOR_TYPES.GRAYLOG:
        return new GraylogConnector();
      case CONNECTOR_TYPES.GITHUB:
        return new GitHubConnector();
      case CONNECTOR_TYPES.SLACK:
        return new SlackConnector();
      case CONNECTOR_TYPES.GENERIC_HTTP:
        return new GenericHttpConnector();
      case CONNECTOR_TYPES.GENERIC_PUSH:
        return new GenericPushConnector();
      default:
        return null;
    }
  }
}
