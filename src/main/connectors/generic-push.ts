// ============================================================
// Generic Push Connector - Accepts arbitrary events via API
// ============================================================

import { BaseConnector } from './base';
import type { ConnectorCapability, ConnectorEvent, PushEventRequest } from '@shared/types';

export class GenericPushConnector extends BaseConnector {
  readonly type = 'generic-push';
  readonly capabilities: ConnectorCapability[] = ['push'];

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);
    this.status.connected = true;
  }

  normalizeInbound(rawEvent: unknown): ConnectorEvent {
    const req = rawEvent as PushEventRequest;

    return this.createEvent({
      severity: req.severity ?? 'info',
      title: req.title ?? 'Push Event',
      body: req.body ?? req.message,
      category: 'notification',
      eventType: req.event ?? 'custom',
      metadata: req.metadata,
      uiHints: req.uiHints ?? {
        icon: 'bell',
        color: '#6366f1',
      },
    });
  }
}
