// ============================================================
// Cursor IDE Connector Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { CursorConnector } from '@main/connectors/cursor';
import type { ConnectorConfig, PushEventRequest } from '@shared/types';

const mockConfig: ConnectorConfig = {
  id: 'cursor-test',
  type: 'cursor',
  displayName: 'Cursor',
  enabled: true,
  pollIntervalMs: 10000,
  auth: { type: 'none' },
  settings: { blinkDurationMs: 30000, editorApp: 'Cursor' },
  ui: { icon: 'code', color: '#007acc', priority: 2 },
};

describe('CursorConnector', () => {
  let connector: CursorConnector;

  beforeEach(async () => {
    connector = new CursorConnector();
    await connector.initialize(mockConfig);
  });

  it('has correct type and capabilities', () => {
    expect(connector.type).toBe('cursor');
    expect(connector.capabilities).toEqual(['pull', 'push', 'action']);
  });

  it('initializes without error', () => {
    const status = connector.getStatus();
    expect(status.id).toBe('cursor-test');
  });

  it('normalizes needs-input push event', () => {
    const req: PushEventRequest = {
      connector: 'cursor',
      event: 'needs-input',
      session: 'my-project',
      message: 'Review changes',
    };

    const event = connector.normalizeInbound(req);

    expect(event.severity).toBe('attention');
    expect(event.title).toBe('Cursor: my-project');
    expect(event.body).toBe('Review changes');
    expect(event.uiHints?.color).toBe('#f97316'); // attention color
    expect(event.uiHints?.blinkDurationMs).toBe(30000);
    expect(event.uiHints?.actionButtons).toHaveLength(1);
    expect(event.uiHints?.actionButtons?.[0]?.label).toBe('Focus Editor');
  });

  it('normalizes task-complete push event', () => {
    const req: PushEventRequest = {
      connector: 'cursor',
      event: 'task-complete',
      session: 'build-456',
    };

    const event = connector.normalizeInbound(req);

    expect(event.severity).toBe('info');
    expect(event.title).toBe('Cursor: build-456');
    expect(event.uiHints?.color).toBe('#007acc');
  });

  it('normalizes unknown event with defaults', () => {
    const req: PushEventRequest = {
      connector: 'cursor',
      event: 'custom-event',
      session: 'sess-1',
      severity: 'warning',
      title: 'Custom notification',
      body: 'Something happened',
    };

    const event = connector.normalizeInbound(req);

    expect(event.severity).toBe('warning');
    expect(event.title).toBe('Custom notification');
    expect(event.body).toBe('Something happened');
  });

  it('provides correct actions', () => {
    const actions = connector.getActions();
    expect(actions).toHaveLength(2);
    expect(actions.map(a => a.id)).toEqual(['focus', 'dismiss']);
    expect(actions[0].label).toBe('Focus Editor');
  });

  it('generates unique event IDs', () => {
    const e1 = connector.normalizeInbound({ connector: 'cursor', event: 'needs-input', session: 's1' });
    const e2 = connector.normalizeInbound({ connector: 'cursor', event: 'needs-input', session: 's1' });
    expect(e1.id).not.toBe(e2.id);
  });

  it('poll returns empty array when workspace storage missing', async () => {
    // In test env, workspace storage likely doesn't exist — should return empty gracefully
    const events = await connector.poll();
    expect(Array.isArray(events)).toBe(true);
  });
});
