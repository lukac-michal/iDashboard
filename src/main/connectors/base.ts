// ============================================================
// Base Connector - Abstract class all connectors extend
// ============================================================

import type {
  ConnectorConfig,
  ConnectorEvent,
  ConnectorAction,
  ConnectorCapability,
  ConnectorStatus,
  ConnectorHealth,
} from '@shared/types';
import type { AuthManager, ResolvedCredentials } from '@main/services/auth-manager';

export abstract class BaseConnector {
  abstract readonly type: string;
  abstract readonly capabilities: ConnectorCapability[];

  protected config!: ConnectorConfig;
  protected authManager?: AuthManager;
  protected status: ConnectorStatus = {
    id: '',
    type: '',
    displayName: '',
    connected: false,
    eventCount: 0,
  };

  async initialize(config: ConnectorConfig, authManager?: AuthManager): Promise<void> {
    this.config = config;
    this.authManager = authManager;
    this.status = {
      id: config.id,
      type: config.type,
      displayName: config.displayName,
      enabled: true,
      connected: false,
      eventCount: 0,
    };
  }

  async destroy(): Promise<void> {
    this.status.connected = false;
  }

  getStatus(): ConnectorStatus {
    return { ...this.status };
  }

  setHealth(health: ConnectorHealth): void {
    this.status.health = health;
  }

  // Pull connectors override this
  async poll(): Promise<ConnectorEvent[]> {
    return [];
  }

  // Push connectors override this to validate/normalize inbound events
  normalizeInbound?(rawEvent: unknown): ConnectorEvent;

  // Connectors with actions override these
  getActions(): ConnectorAction[] {
    return [];
  }

  async executeAction(_actionId: string, _params?: unknown): Promise<void> {
    // no-op by default
  }

  /** Resolve auth config to HTTP headers */
  protected async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.authManager) return {};
    const creds = await this.authManager.resolveCredentials(this.config.auth, this.config.id);
    return creds.headers;
  }

  /** Make an authenticated HTTP request */
  protected async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const authHeaders = await this.getAuthHeaders();
    const headers = {
      ...authHeaders,
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    };

    const startTime = Date.now();
    const response = await fetch(url, { ...options, headers });
    const latencyMs = Date.now() - startTime;

    this.status.lastPollAt = Date.now();

    if (response.ok) {
      this.status.connected = true;
      this.status.lastError = undefined;
    } else if (response.status === 401 || response.status === 403) {
      this.status.connected = false;
      this.status.lastError = `Auth failed: ${response.status}`;
    }

    return response;
  }

  protected createEvent(
    partial: Omit<ConnectorEvent, 'id' | 'connectorId' | 'timestamp'>,
  ): ConnectorEvent {
    this.status.eventCount++;
    return {
      id: `${this.config.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      connectorId: this.config.id,
      timestamp: Date.now(),
      ...partial,
    };
  }
}
