// ============================================================
// Claude Code Connector Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeCodeConnector } from '@main/connectors/claude-code';
import type { ConnectorConfig, PushEventRequest } from '@shared/types';

const mockConfig: ConnectorConfig = {
  id: 'claude-code-test',
  type: 'claude-code',
  displayName: 'Claude Code',
  enabled: true,
  pollIntervalMs: 0,
  auth: { type: 'none' },
  settings: { blinkDurationMs: 30000 },
  ui: { icon: 'terminal', color: '#f97316', priority: 1 },
};

describe('ClaudeCodeConnector', () => {
  let connector: ClaudeCodeConnector;

  beforeEach(async () => {
    connector = new ClaudeCodeConnector();
    await connector.initialize(mockConfig);
  });

  it('has correct type and capabilities', () => {
    expect(connector.type).toBe('claude-code');
    expect(connector.capabilities).toEqual(['push', 'action']);
  });

  it('is connected immediately after init', () => {
    expect(connector.getStatus().connected).toBe(true);
  });

  it('normalizes needs-input event', () => {
    const req: PushEventRequest = {
      connector: 'claude-code',
      event: 'needs-input',
      session: 'my-session',
      message: 'Choose option A or B',
    };

    const event = connector.normalizeInbound(req);

    expect(event.severity).toBe('attention');
    expect(event.title).toBe('Claude Code: my-session');
    expect(event.body).toBe('Choose option A or B');
    expect(event.uiHints?.color).toBe('#f97316');
    expect(event.uiHints?.blinkDurationMs).toBe(30000);
    expect(event.uiHints?.actionButtons).toHaveLength(1);
  });

  it('normalizes task-complete event', () => {
    const req: PushEventRequest = {
      connector: 'claude-code',
      event: 'task-complete',
      session: 'build-123',
    };

    const event = connector.normalizeInbound(req);

    expect(event.severity).toBe('info');
    expect(event.title).toBe('Claude Code: build-123');
    expect(event.uiHints?.color).toBe('#22c55e');
  });

  it('normalizes unknown event with defaults', () => {
    const req: PushEventRequest = {
      connector: 'claude-code',
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

  it('tracks active sessions', () => {
    connector.normalizeInbound({ connector: 'cc', event: 'needs-input', session: 's1' });
    connector.normalizeInbound({ connector: 'cc', event: 'task-complete', session: 's2' });

    const sessions = connector.getActiveSessions();
    expect(sessions.size).toBe(2);
    expect(sessions.get('s1')?.status).toBe('needs-input');
    expect(sessions.get('s2')?.status).toBe('task-complete');
  });

  it('provides correct actions', () => {
    const actions = connector.getActions();
    expect(actions).toHaveLength(2);
    expect(actions.map(a => a.id)).toEqual(['focus', 'dismiss']);
  });

  it('generates unique event IDs', () => {
    const e1 = connector.normalizeInbound({ connector: 'cc', event: 'needs-input', session: 's1' });
    const e2 = connector.normalizeInbound({ connector: 'cc', event: 'needs-input', session: 's1' });
    expect(e1.id).not.toBe(e2.id);
  });
});
