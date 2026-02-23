// ============================================================
// SlackConnector Send Capability Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackConnector } from '@main/connectors/slack';
import type { ConnectorConfig } from '@shared/types';

// Suppress log output in tests
vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

function makeConfig(overrides: Partial<ConnectorConfig['settings']> = {}): ConnectorConfig {
  return {
    id: 'slack-1',
    type: 'slack',
    displayName: 'Slack',
    enabled: true,
    pollIntervalMs: 30000,
    auth: { type: 'bearer', token: 'xoxb-test-token' },
    settings: {
      channels: ['#general', '#dev'],
      keywordFilters: [],
      mentionAlerts: false,
      ...overrides,
    },
    ui: { icon: 'message-square', color: '#611f69' },
  };
}

describe('SlackConnector — send capability', () => {
  let connector: SlackConnector;

  beforeEach(async () => {
    connector = new SlackConnector();
    await connector.initialize(makeConfig());
  });

  it('has pull and action capabilities', () => {
    expect(connector.capabilities).toContain('pull');
    expect(connector.capabilities).toContain('action');
  });

  it('getActions returns send-message and reply-dm actions', () => {
    const actions = connector.getActions();
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      id: 'send-message',
      label: 'Send to Slack',
      icon: 'message-square',
    });
    expect(actions[1]).toEqual({
      id: 'reply-dm',
      label: 'Reply to DM',
      icon: 'reply',
    });
  });

  it('getMonitoredChannels returns configured channels', () => {
    const channels = connector.getMonitoredChannels();
    expect(channels).toEqual(['#general', '#dev']);
  });

  it('getMonitoredChannels returns a copy', () => {
    const c1 = connector.getMonitoredChannels();
    const c2 = connector.getMonitoredChannels();
    expect(c1).not.toBe(c2);
    expect(c1).toEqual(c2);
  });

  describe('sendMessage', () => {
    it('sends message successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: '1234567890.123456' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await connector.sendMessage('#general', 'Hello from iDashboard!');

      expect(result).toEqual({ ok: true, ts: '1234567890.123456' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://slack.com/api/chat.postMessage');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.channel).toBe('#general');
      expect(body.text).toBe('Hello from iDashboard!');
      expect(body.thread_ts).toBeUndefined();

      vi.unstubAllGlobals();
    });

    it('sends threaded reply', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: '1234567890.999' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await connector.sendMessage('#dev', 'Thread reply', '1234567890.000');

      expect(result.ok).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.thread_ts).toBe('1234567890.000');

      vi.unstubAllGlobals();
    });

    it('returns error on HTTP failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await connector.sendMessage('#general', 'test');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('HTTP 500');

      vi.unstubAllGlobals();
    });

    it('returns Slack API error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false, error: 'channel_not_found' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await connector.sendMessage('#nonexistent', 'test');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('channel_not_found');

      vi.unstubAllGlobals();
    });
  });

  describe('executeAction', () => {
    it('delegates send-message to sendMessage', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: '123' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await connector.executeAction('send-message', {
        channel: '#general',
        text: 'Action test',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toBe('Action test');

      vi.unstubAllGlobals();
    });

    it('throws on Slack API error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false, error: 'not_authed' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        connector.executeAction('send-message', { channel: '#x', text: 'test' }),
      ).rejects.toThrow('Slack send failed: not_authed');

      vi.unstubAllGlobals();
    });
  });
});
