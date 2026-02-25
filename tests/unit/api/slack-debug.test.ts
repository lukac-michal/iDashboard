// ============================================================
// Slack Debug Endpoint Unit Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerSlackDebugRoutes } from '@main/api/routes/slack-debug';
import type { APIContext } from '@main/api/server';

vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

function createMockSlackConnector() {
  return {
    type: 'slack',
    getBotUserId: vi.fn().mockReturnValue('U08BOT'),
    getMonitoredChannels: vi.fn().mockReturnValue(['#general', '#dev']),
    getChannelIds: vi.fn().mockReturnValue({ general: 'C08GEN', dev: 'C09DEV' }),
    getLastTimestamps: vi.fn().mockReturnValue({ C08GEN: '1740000000.000000' }),
    getActiveThreads: vi.fn().mockReturnValue({ 'C08GEN:1740000.123': '1740001.456' }),
    getDmChannels: vi.fn().mockReturnValue(new Map()),
    getUserNameCacheSize: vi.fn().mockReturnValue(12),
    getKeywordFilters: vi.fn().mockReturnValue(['error', 'bug']),
  };
}

function createMockBridge() {
  const sessionThreads = new Map([
    ['my-project', { threadTs: '174000.123', lastMessageAt: 1708771800000 }],
  ]);
  const threadToSession = new Map([['174000.123', 'my-project']]);

  return {
    getConfig: vi.fn().mockReturnValue({
      enabled: true,
      targetChannel: '#claude-output',
      forwardStop: true,
      forwardSubagentStop: true,
      forwardTaskComplete: true,
      forwardToolUse: false,
      forwardNeedsInput: true,
      forwardUserPrompt: true,
      threadingMode: 'continuous',
      maxThreadMessages: 50,
      reverseEnabled: false,
      maxMessageLength: 3000,
    }),
    getSessionThreads: vi.fn().mockReturnValue(sessionThreads),
    getThreadToSession: vi.fn().mockReturnValue(threadToSession),
    getPendingBatchSessions: vi.fn().mockReturnValue([
      { session: 'my-project', messageCount: 3 },
    ]),
    getBotUserId: vi.fn().mockReturnValue('U08BOT'),
  };
}

function createMockContext(opts: {
  hasSlack?: boolean;
  hasBridge?: boolean;
} = {}): APIContext {
  const { hasSlack = true, hasBridge = true } = opts;

  const mockConnector = hasSlack ? createMockSlackConnector() : null;

  return {
    engine: {
      getStatuses: vi.fn().mockReturnValue(
        hasSlack
          ? [{ id: 'slack-1', type: 'slack', displayName: 'Slack', connected: true, eventCount: 0 }]
          : [],
      ),
      getConnector: vi.fn().mockReturnValue(mockConnector),
      getConnectorConfig: vi.fn().mockReturnValue(
        hasSlack ? { settings: { dmEnabled: false } } : undefined,
      ),
    } as unknown as APIContext['engine'],
    eventStore: {} as APIContext['eventStore'],
    aggregator: {} as APIContext['aggregator'],
    config: {
      slackBridge: hasBridge ? { enabled: true } : undefined,
    } as APIContext['config'],
    broadcastEvent: vi.fn(),
    slackBridge: hasBridge ? createMockBridge() as unknown as APIContext['slackBridge'] : null,
  };
}

describe('GET /api/v1/debug/slack', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    if (server) await server.close();
  });

  async function setupServer(ctx: APIContext): Promise<FastifyInstance> {
    server = Fastify({ logger: false });
    registerSlackDebugRoutes(server, ctx);
    await server.ready();
    return server;
  }

  it('returns full debug state with connector and bridge', async () => {
    const ctx = createMockContext({ hasSlack: true, hasBridge: true });
    const srv = await setupServer(ctx);

    const resp = await srv.inject({ method: 'GET', url: '/api/v1/debug/slack' });
    const body = JSON.parse(resp.body);

    expect(resp.statusCode).toBe(200);
    expect(body.ok).toBe(true);

    // Connector
    expect(body.data.connector).not.toBeNull();
    expect(body.data.connector.id).toBe('slack-1');
    expect(body.data.connector.connected).toBe(true);
    expect(body.data.connector.botUserId).toBe('U08BOT');
    expect(body.data.connector.monitoredChannels).toEqual(['#general', '#dev']);
    expect(body.data.connector.channelIds).toEqual({ general: 'C08GEN', dev: 'C09DEV' });
    expect(body.data.connector.lastTimestamps).toEqual({ C08GEN: '1740000000.000000' });
    expect(body.data.connector.activeThreads).toEqual({ 'C08GEN:1740000.123': '1740001.456' });
    expect(body.data.connector.userNameCacheSize).toBe(12);
    expect(body.data.connector.keywordFilters).toEqual(['error', 'bug']);

    // Bridge
    expect(body.data.bridge).not.toBeNull();
    expect(body.data.bridge.enabled).toBe(true);
    expect(body.data.bridge.targetChannel).toBe('#claude-output');
    expect(body.data.bridge.forwardStop).toBe(true);
    expect(body.data.bridge.forwardSubagentStop).toBe(true);
    expect(body.data.bridge.forwardTaskComplete).toBe(true);
    expect(body.data.bridge.forwardToolUse).toBe(false);
    expect(body.data.bridge.forwardNeedsInput).toBe(true);
    expect(body.data.bridge.forwardUserPrompt).toBe(true);
    expect(body.data.bridge.threadingMode).toBe('continuous');
    expect(body.data.bridge.maxThreadMessages).toBe(50);
    expect(body.data.bridge.reverseEnabled).toBe(false);
    expect(body.data.bridge.maxMessageLength).toBe(3000);
    expect(body.data.bridge.sessionThreads['my-project']).toBeDefined();
    expect(body.data.bridge.sessionThreads['my-project'].threadTs).toBe('174000.123');
    expect(body.data.bridge.threadToSession['174000.123']).toBe('my-project');
    expect(body.data.bridge.pendingBatches).toEqual([{ session: 'my-project', messageCount: 3 }]);
    expect(body.data.bridge.botUserId).toBe('U08BOT');

    // Channel logger
    expect(body.data.channelLogger).not.toBeNull();
    expect(body.data.channelLogger.logDir).toBe('~/.idashboard/logs/slack/');
  });

  it('returns connector: null when no Slack connector exists', async () => {
    const ctx = createMockContext({ hasSlack: false, hasBridge: true });
    const srv = await setupServer(ctx);

    const resp = await srv.inject({ method: 'GET', url: '/api/v1/debug/slack' });
    const body = JSON.parse(resp.body);

    expect(resp.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.connector).toBeNull();
    expect(body.data.bridge).not.toBeNull();
  });

  it('returns bridge: null when bridge is not enabled', async () => {
    const ctx = createMockContext({ hasSlack: true, hasBridge: false });
    const srv = await setupServer(ctx);

    const resp = await srv.inject({ method: 'GET', url: '/api/v1/debug/slack' });
    const body = JSON.parse(resp.body);

    expect(resp.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.connector).not.toBeNull();
    expect(body.data.bridge).toBeNull();
  });

  it('returns all null sections when nothing is configured', async () => {
    const ctx = createMockContext({ hasSlack: false, hasBridge: false });
    const srv = await setupServer(ctx);

    const resp = await srv.inject({ method: 'GET', url: '/api/v1/debug/slack' });
    const body = JSON.parse(resp.body);

    expect(resp.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.connector).toBeNull();
    expect(body.data.bridge).toBeNull();
    expect(body.data.channelLogger).toBeNull();
  });
});
