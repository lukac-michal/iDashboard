// ============================================================
// SlackConnector DM Polling Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      channels: ['#general'],
      keywordFilters: [],
      mentionAlerts: false,
      ...overrides,
    },
    ui: { icon: 'message-square', color: '#611f69' },
  };
}

/** Stub fetch to handle auth.test, conversations.list, and conversations.history */
function stubFetchForDM(options: {
  botUserId?: string;
  dmChannelId?: string;
  dmOtherUser?: string;
  authFail?: boolean;
  imListFail?: boolean;
  dmMessages?: Array<{ ts: string; type: string; text: string; user?: string; thread_ts?: string }>;
  channelMessages?: Array<{ ts: string; type: string; text: string; user?: string }>;
}) {
  const {
    botUserId = 'U_BOT_123',
    dmChannelId = 'D_DM_456',
    dmOtherUser = 'U_HUMAN',
    authFail = false,
    imListFail = false,
    dmMessages = [],
    channelMessages = [],
  } = options;

  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('auth.test')) {
      return Promise.resolve({
        ok: !authFail,
        status: authFail ? 401 : 200,
        json: () => Promise.resolve(
          authFail ? { ok: false, error: 'not_authed' } : { ok: true, user_id: botUserId },
        ),
      });
    }
    if (url.includes('conversations.list')) {
      const parsedUrl = new URL(url);
      const types = parsedUrl.searchParams.get('types') ?? '';
      if (types.includes('im')) {
        // IM channel list response
        if (imListFail) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: false, error: 'missing_scope' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            channels: [
              { id: dmChannelId, name: dmOtherUser, user: dmOtherUser },
            ],
          }),
        });
      }
      // Regular channel list (for resolveChannelIds)
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          channels: [{ id: 'C_GEN_001', name: 'general' }],
        }),
      });
    }
    if (url.includes('conversations.history')) {
      const params = new URL(url).searchParams;
      const channel = params.get('channel');
      const messages = channel === dmChannelId ? dmMessages : channelMessages;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, messages }),
      });
    }
    if (url.includes('users.info')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          user: { id: dmOtherUser, name: dmOtherUser, real_name: dmOtherUser },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });
}

describe('SlackConnector — DM polling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('dmEnabled: false (default)', () => {
    it('calls auth.test (for bot ID) but not conversations.list for IMs during initialize', async () => {
      const mockFetch = stubFetchForDM({});
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: false }));

      // auth.test is always called to resolve bot user ID (for filtering own messages)
      const authCalls = mockFetch.mock.calls.filter(([url]: [string]) => url.includes('auth.test'));
      expect(authCalls).toHaveLength(1);
      // conversations.list for IMs should NOT be called when dmEnabled is false
      const imListCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
        url.includes('conversations.list') && url.includes('types=im'),
      );
      expect(imListCalls).toHaveLength(0);
    });

    it('does not fetch DM messages during poll', async () => {
      const mockFetch = stubFetchForDM({ channelMessages: [] });
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: false }));
      await connector.poll();

      // Should only poll the configured channel, not a DM channel
      const historyCalls = mockFetch.mock.calls.filter(([url]: [string]) => url.includes('conversations.history'));
      expect(historyCalls).toHaveLength(1);
    });
  });

  describe('dmEnabled: true — initialization', () => {
    it('resolves bot user ID and discovers DM channels during initialize', async () => {
      const mockFetch = stubFetchForDM({ botUserId: 'U_BOT_789', dmChannelId: 'D_DM_ABC', dmOtherUser: 'U_ALICE' });
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: true }));

      expect(connector.getBotUserId()).toBe('U_BOT_789');
      expect(connector.getDmChannels().size).toBe(1);
      expect(connector.getDmChannels().get('D_DM_ABC')).toBe('U_ALICE');
    });

    it('gracefully degrades when auth.test fails', async () => {
      const mockFetch = stubFetchForDM({ authFail: true });
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: true }));

      expect(connector.getBotUserId()).toBeNull();
      expect(connector.getDmChannels().size).toBe(0);
    });

    it('gracefully degrades when IM list fails', async () => {
      const mockFetch = stubFetchForDM({ imListFail: true });
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: true }));

      expect(connector.getBotUserId()).toBe('U_BOT_123');
      expect(connector.getDmChannels().size).toBe(0);
    });

    it('still works for channel polling when DM resolution fails', async () => {
      const mockFetch = stubFetchForDM({
        authFail: true,
        channelMessages: [
          { ts: '100.001', type: 'message', text: 'hello from channel', user: 'U_USER' },
        ],
      });
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: true }));
      const events = await connector.poll();

      // Channel messages still produce events (keywordFilters is empty = 'all' match)
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].title).toBe('Slack: #general');
    });
  });

  describe('DM poll events', () => {
    let connector: SlackConnector;

    beforeEach(async () => {
      const mockFetch = stubFetchForDM({
        botUserId: 'U_BOT_123',
        dmChannelId: 'D_DM_456',
        dmOtherUser: 'U_HUMAN',
        dmMessages: [
          { ts: '200.001', type: 'message', text: 'Hey bot, status update?', user: 'U_HUMAN' },
          { ts: '200.002', type: 'message', text: 'Sure, here it is', user: 'U_BOT_123' },
          { ts: '200.003', type: 'message', text: 'Thanks!', user: 'U_HUMAN', thread_ts: '200.001' },
        ],
        channelMessages: [],
      });
      vi.stubGlobal('fetch', mockFetch);

      connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: true }));
    });

    it('creates dm-received events from DM messages', async () => {
      const events = await connector.poll();
      const dmEvents = events.filter(e => e.eventType === 'dm-received');

      expect(dmEvents.length).toBe(2); // Bot's own message filtered out
    });

    it('filters out bot own messages', async () => {
      const events = await connector.poll();
      const dmEvents = events.filter(e => e.eventType === 'dm-received');

      // None of the DM events should be from the bot
      for (const ev of dmEvents) {
        expect(ev.metadata?.userId).not.toBe('U_BOT_123');
      }
    });

    it('sets correct event properties for DM events', async () => {
      const events = await connector.poll();
      const dmEvents = events.filter(e => e.eventType === 'dm-received');
      const first = dmEvents[0];

      expect(first.severity).toBe('info');
      expect(first.title).toContain('DM:');
      expect(first.body).toBe('Hey bot, status update?');
      expect(first.category).toBe('notification');
      expect(first.metadata?.isDM).toBe(true);
      expect(first.metadata?.dmChannelId).toBe('D_DM_456');
    });

    it('includes reply action button in DM events', async () => {
      const events = await connector.poll();
      const dmEvents = events.filter(e => e.eventType === 'dm-received');

      for (const ev of dmEvents) {
        expect(ev.uiHints?.actionButtons).toEqual([
          { id: 'reply-dm', label: 'Reply', icon: 'reply' },
        ]);
      }
    });

    it('preserves threadTs in DM event metadata', async () => {
      const events = await connector.poll();
      const dmEvents = events.filter(e => e.eventType === 'dm-received');
      const threaded = dmEvents.find(e => e.metadata?.threadTs);

      expect(threaded).toBeDefined();
      expect(threaded!.metadata?.threadTs).toBe('200.001');
    });
  });

  describe('getActions with DM support', () => {
    it('includes reply-dm action', async () => {
      const connector = new SlackConnector();
      await connector.initialize(makeConfig());

      const actions = connector.getActions();
      expect(actions).toHaveLength(2);
      expect(actions.find(a => a.id === 'reply-dm')).toEqual({
        id: 'reply-dm',
        label: 'Reply to DM',
        icon: 'reply',
      });
    });
  });

  describe('executeAction reply-dm', () => {
    it('sends reply to DM channel', async () => {
      const mockFetch = stubFetchForDM({ botUserId: 'U_BOT_123', dmChannelId: 'D_DM_456' });
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: true }));

      // Add a successful postMessage response
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('chat.postMessage')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, ts: '300.001' }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      await connector.executeAction('reply-dm', { text: 'Hello back!' });

      const postCalls = mockFetch.mock.calls.filter(([url]: [string]) => url.includes('chat.postMessage'));
      expect(postCalls).toHaveLength(1);
      const body = JSON.parse(postCalls[0][1].body);
      expect(body.channel).toBe('D_DM_456');
      expect(body.text).toBe('Hello back!');
    });

    it('sends threaded reply to DM channel', async () => {
      const mockFetch = stubFetchForDM({ botUserId: 'U_BOT_123', dmChannelId: 'D_DM_456' });
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: true }));

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('chat.postMessage')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, ts: '300.002' }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      await connector.executeAction('reply-dm', { text: 'Thread reply', threadTs: '200.001' });

      const postCalls = mockFetch.mock.calls.filter(([url]: [string]) => url.includes('chat.postMessage'));
      expect(postCalls).toHaveLength(1);
      const body = JSON.parse(postCalls[0][1].body);
      expect(body.channel).toBe('D_DM_456');
      expect(body.thread_ts).toBe('200.001');
    });

    it('throws when DM channel is not resolved', async () => {
      const mockFetch = stubFetchForDM({ authFail: true });
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: true }));

      await expect(
        connector.executeAction('reply-dm', { text: 'test' }),
      ).rejects.toThrow('DM channel not resolved');
    });

    it('throws on Slack API error when replying', async () => {
      const mockFetch = stubFetchForDM({ botUserId: 'U_BOT_123', dmChannelId: 'D_DM_456' });
      vi.stubGlobal('fetch', mockFetch);

      const connector = new SlackConnector();
      await connector.initialize(makeConfig({ dmEnabled: true }));

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('chat.postMessage')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: false, error: 'channel_not_found' }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      await expect(
        connector.executeAction('reply-dm', { text: 'test' }),
      ).rejects.toThrow('Slack DM reply failed: channel_not_found');
    });
  });
});
