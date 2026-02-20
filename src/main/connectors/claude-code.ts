// ============================================================
// Claude Code Connector
// Push-based: receives events from Claude Code hooks via local API
// ============================================================

import { BaseConnector } from './base';
import { DEFAULT_BLINK_DURATION } from '@shared/constants';
import type {
  ConnectorCapability,
  ConnectorEvent,
  ConnectorAction,
  PushEventRequest,
} from '@shared/types';

export class ClaudeCodeConnector extends BaseConnector {
  readonly type = 'claude-code';
  readonly capabilities: ConnectorCapability[] = ['push', 'action'];

  private activeSessions = new Map<string, { lastEvent: number; status: string }>();

  override async initialize(config: Parameters<BaseConnector['initialize']>[0]): Promise<void> {
    await super.initialize(config);
    this.status.connected = true; // Push connector is always "connected"
  }

  normalizeInbound(rawEvent: unknown): ConnectorEvent {
    const req = rawEvent as PushEventRequest;
    const eventType = req.event ?? 'notification';
    const sessionId = req.session ?? 'unknown';
    const message = req.message ?? req.body ?? '';

    // Track session state
    this.activeSessions.set(sessionId, {
      lastEvent: Date.now(),
      status: eventType,
    });

    const blinkDuration =
      req.uiHints?.blinkDurationMs ??
      (this.config.settings.blinkDurationMs as number | undefined) ??
      DEFAULT_BLINK_DURATION;

    switch (eventType) {
      case 'needs-input':
        return this.createEvent({
          severity: 'attention',
          title: `Claude Code: ${sessionId}`,
          body: message || 'Waiting for your input',
          metadata: { sessionId, eventType },
          uiHints: {
            icon: 'terminal',
            color: '#f97316', // orange
            blinkDurationMs: blinkDuration,
            actionButtons: [
              { id: 'focus', label: 'Focus Terminal', icon: 'external-link', variant: 'primary' },
              { id: 'dismiss', label: 'Dismiss', icon: 'x' },
            ],
          },
        });

      case 'task-complete':
        return this.createEvent({
          severity: 'info',
          title: `Claude Code: ${sessionId}`,
          body: 'Task completed',
          metadata: { sessionId, eventType },
          uiHints: {
            icon: 'check-circle',
            color: '#22c55e', // green
            actionButtons: [
              { id: 'dismiss', label: 'Clear', icon: 'x' },
            ],
          },
        });

      default:
        return this.createEvent({
          severity: req.severity ?? 'info',
          title: req.title ?? `Claude Code: ${sessionId}`,
          body: message,
          metadata: { sessionId, eventType },
          uiHints: req.uiHints ?? {
            icon: 'terminal',
            color: '#f97316',
          },
        });
    }
  }

  override getActions(): ConnectorAction[] {
    return [
      {
        id: 'focus',
        label: 'Focus Terminal',
        icon: 'external-link',
        description: 'Bring the terminal window to the foreground',
      },
      {
        id: 'dismiss',
        label: 'Dismiss',
        icon: 'x',
        description: 'Dismiss the notification',
      },
    ];
  }

  override async executeAction(actionId: string, params?: unknown): Promise<void> {
    switch (actionId) {
      case 'focus':
        // Platform-specific terminal focus will be implemented in window manager
        // This is a placeholder for the action dispatch
        break;
      case 'dismiss':
        // Handled by the event bus - dismiss the event
        break;
    }
  }

  getActiveSessions(): Map<string, { lastEvent: number; status: string }> {
    return new Map(this.activeSessions);
  }
}
