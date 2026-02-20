// ============================================================
// Generic Push Connector Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { GenericPushConnector } from '@main/connectors/generic-push';
import type { ConnectorConfig } from '@shared/types';

const mockConfig: ConnectorConfig = {
  id: 'generic-push-test',
  type: 'generic-push',
  displayName: 'Generic Push',
  enabled: true,
  pollIntervalMs: 0,
  auth: { type: 'none' },
  settings: {},
  ui: { icon: 'bell', color: '#6366f1' },
};

describe('GenericPushConnector', () => {
  let connector: GenericPushConnector;

  beforeEach(async () => {
    connector = new GenericPushConnector();
    await connector.initialize(mockConfig);
  });

  it('normalizes a basic push event', () => {
    const event = connector.normalizeInbound({
      title: 'Build finished',
      severity: 'info',
      body: 'All tests passed',
    });

    expect(event.title).toBe('Build finished');
    expect(event.severity).toBe('info');
    expect(event.body).toBe('All tests passed');
    expect(event.connectorId).toBe('generic-push-test');
  });

  it('uses defaults for missing fields', () => {
    const event = connector.normalizeInbound({});

    expect(event.title).toBe('Push Event');
    expect(event.severity).toBe('info');
  });

  it('preserves custom UI hints', () => {
    const event = connector.normalizeInbound({
      title: 'Custom',
      uiHints: { icon: 'alert-triangle', color: '#ff0000' },
    });

    expect(event.uiHints?.icon).toBe('alert-triangle');
    expect(event.uiHints?.color).toBe('#ff0000');
  });
});
