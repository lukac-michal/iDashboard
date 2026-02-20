// ============================================================
// Base Connector - Abstract class all connectors extend
// ============================================================

import type {
  ConnectorConfig,
  ConnectorEvent,
  ConnectorAction,
  ConnectorCapability,
  ConnectorStatus,
} from '@shared/types';

export abstract class BaseConnector {
  abstract readonly type: string;
  abstract readonly capabilities: ConnectorCapability[];

  protected config!: ConnectorConfig;
  protected status: ConnectorStatus = {
    id: '',
    type: '',
    displayName: '',
    connected: false,
    eventCount: 0,
  };

  async initialize(config: ConnectorConfig): Promise<void> {
    this.config = config;
    this.status = {
      id: config.id,
      type: config.type,
      displayName: config.displayName,
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

  protected createEvent(
    partial: Omit<ConnectorEvent, 'id' | 'connectorId' | 'timestamp'>
  ): ConnectorEvent {
    return {
      id: `${this.config.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      connectorId: this.config.id,
      timestamp: Date.now(),
      ...partial,
    };
  }
}
