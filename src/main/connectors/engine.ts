// ============================================================
// Connector Engine - Scheduler, lifecycle, polling orchestrator
// ============================================================

import { BaseConnector } from './base';
import { ClaudeCodeConnector } from './claude-code';
import { TeamCityConnector } from './teamcity';
import { OctopusDeployConnector } from './octopus-deploy';
import { GraylogConnector } from './graylog';
import { GitHubConnector } from './github';
import { SlackConnector } from './slack';
import { GenericHttpConnector } from './generic-http';
import { GenericPushConnector } from './generic-push';
import { CircuitBreaker } from '@main/services/circuit-breaker';
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
      try { cb(event); } catch (e) { console.error('[Engine] Event callback error:', e); }
    }
  }

  /** Start a connector from config */
  async addConnector(config: ConnectorConfig): Promise<void> {
    if (this.connectors.has(config.id)) {
      await this.removeConnector(config.id);
    }

    const connector = this.createConnector(config.type);
    if (!connector) {
      console.warn(`[Engine] Unknown connector type: ${config.type}`);
      return;
    }

    const requiresVpn = (config.settings.requiresVpn as boolean) ?? false;
    const circuitBreaker = new CircuitBreaker({ requiresVpn });

    const managed: ManagedConnector = { connector, config, circuitBreaker };
    this.connectors.set(config.id, managed);

    try {
      await connector.initialize(config, this.authManager);
      console.log(`[Engine] Initialized connector: ${config.id} (${config.type})`);
    } catch (err) {
      console.error(`[Engine] Failed to initialize ${config.id}:`, err);
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
    const managed = this.connectors.get(id);
    if (!managed) return;

    if (managed.timer) clearInterval(managed.timer);
    await managed.connector.destroy();
    this.connectors.delete(id);
    console.log(`[Engine] Removed connector: ${id}`);
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
      console.warn(`[Engine] No push handler for connector: ${targetConnector}`);
      return null;
    }

    try {
      const event = managed.connector.normalizeInbound(rawEvent);
      this.emitEvent(event);
      return event;
    } catch (err) {
      console.error(`[Engine] Push event normalization failed:`, err);
      return null;
    }
  }

  /** Get status for all connectors */
  getStatuses(): ConnectorStatus[] {
    return [...this.connectors.values()].map(m => {
      const status = m.connector.getStatus();
      status.health = m.circuitBreaker.getHealth();
      return status;
    });
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

  /** Execute an action on a connector */
  async executeAction(connectorId: string, actionId: string, params?: unknown): Promise<void> {
    const managed = this.connectors.get(connectorId);
    if (!managed) throw new Error(`Connector not found: ${connectorId}`);
    await managed.connector.executeAction(actionId, params);
  }

  /** Replace all connectors with new configs (for hot-reload) */
  async reloadConnectors(configs: ConnectorConfig[]): Promise<void> {
    // Remove connectors that are no longer in config
    const newIds = new Set(configs.map(c => c.id));
    for (const id of this.connectors.keys()) {
      if (!newIds.has(id)) {
        await this.removeConnector(id);
      }
    }

    // Add/update connectors
    for (const config of configs) {
      if (!config.enabled) {
        await this.removeConnector(config.id);
        continue;
      }
      await this.addConnector(config);
    }
  }

  /** Destroy all connectors */
  async destroy(): Promise<void> {
    for (const id of [...this.connectors.keys()]) {
      await this.removeConnector(id);
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
        console.error(`[Engine] Poll failed for ${managed.config.id}: ${errMsg}`);

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
