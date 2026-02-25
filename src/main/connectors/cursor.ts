// ============================================================
// Cursor IDE Connector
// Push-based: receives events from Cursor hooks via local API
// ============================================================

import { execFile } from 'node:child_process';
import { BaseConnector } from './base';
import { DEFAULT_BLINK_DURATION } from '@shared/constants';
import { log, warn } from '@main/utils/log';
import type {
  ConnectorCapability,
  ConnectorEvent,
  ConnectorAction,
  PushEventRequest,
} from '@shared/types';

export class CursorConnector extends BaseConnector {
  readonly type = 'cursor';
  readonly capabilities: ConnectorCapability[] = ['push', 'action'];

  private activeSessions = new Map<string, { lastEvent: number; status: string }>();

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);
    this.status.connected = true; // Push connector is always "connected"
  }

  normalizeInbound(rawEvent: unknown): ConnectorEvent {
    const req = rawEvent as PushEventRequest;
    const eventType = req.event ?? 'notification';
    const sessionId = req.session ?? 'unknown';
    const message = req.message ?? req.body ?? '';

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
          title: `Cursor: ${sessionId}`,
          body: message || 'Waiting for your input',
          category: 'notification',
          eventType: 'needs-input',
          metadata: { sessionId, eventType },
          uiHints: {
            icon: 'code',
            color: '#007acc',
            blinkDurationMs: blinkDuration,
            actionButtons: [
              { id: 'focus', label: 'Focus Editor', icon: 'external-link', variant: 'primary' },
            ],
          },
        });

      case 'task-complete':
        return this.createEvent({
          severity: 'info',
          title: `Cursor: ${sessionId}`,
          body: 'Task completed',
          category: 'notification',
          eventType: 'task-complete',
          metadata: { sessionId, eventType },
          uiHints: {
            icon: 'check-circle',
            color: '#22c55e',
            blinkDurationMs: blinkDuration,
            actionButtons: [
              { id: 'focus', label: 'Focus Editor', icon: 'external-link', variant: 'primary' },
            ],
          },
        });

      default: {
        const severity = req.severity ?? 'info';
        return this.createEvent({
          severity,
          title: req.title ?? `Cursor: ${sessionId}`,
          body: message,
          category: 'notification',
          eventType,
          metadata: { sessionId, eventType },
          uiHints: req.uiHints ?? {
            icon: 'code',
            color: '#007acc',
            blinkDurationMs: blinkDuration,
            actionButtons: [
              { id: 'focus', label: 'Focus Editor', icon: 'external-link', variant: 'primary' as const },
            ],
          },
        });
      }
    }
  }

  override getActions(): ConnectorAction[] {
    return [
      { id: 'focus', label: 'Focus Editor', icon: 'external-link', description: 'Bring Cursor editor to foreground' },
      { id: 'dismiss', label: 'Dismiss', icon: 'x', description: 'Dismiss the notification' },
    ];
  }

  override async executeAction(actionId: string, _params?: unknown): Promise<void> {
    if (actionId === 'focus') {
      if (process.platform !== 'darwin') {
        log('Cursor', 'Editor focus is not available on this platform');
        return;
      }
      const editorApp = (this.config.settings.editorApp as string) ?? 'Cursor';
      log('Cursor', `Activating ${editorApp}`);
      execFile('osascript', ['-e', `tell application "${editorApp}" to activate`], (err) => {
        if (err) warn('Cursor', `Failed to focus ${editorApp}:`, err.message);
      });
    }
  }

  getActiveSessions(): Map<string, { lastEvent: number; status: string }> {
    return new Map(this.activeSessions);
  }
}
