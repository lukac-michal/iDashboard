// ============================================================
// Slack Debug Route - GET /api/v1/debug/slack
// Dumps all Slack-related internal state for debugging
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';
import type { SlackConnector } from '@main/connectors/slack';

export function registerSlackDebugRoutes(server: FastifyInstance, ctx: APIContext): void {
  server.get(`${API_PREFIX}/debug/slack`, async (_request, reply) => {
    // --- Connector state ---
    let connectorData: Record<string, unknown> | null = null;

    const statuses = ctx.engine.getStatuses();
    const slackStatus = statuses.find(s => s.type === 'slack');

    if (slackStatus) {
      const connector = ctx.engine.getConnector(slackStatus.id) as SlackConnector | undefined;

      connectorData = {
        id: slackStatus.id,
        connected: slackStatus.connected,
        botUserId: connector?.getBotUserId() ?? null,
        monitoredChannels: connector?.getMonitoredChannels() ?? [],
        channelIds: connector?.getChannelIds() ?? {},
        lastTimestamps: connector?.getLastTimestamps() ?? {},
        activeThreads: connector?.getActiveThreads() ?? {},
        dmEnabled: false,
        dmChannels: connector ? Object.fromEntries(connector.getDmChannels()) : {},
        userNameCacheSize: connector?.getUserNameCacheSize() ?? 0,
        keywordFilters: connector?.getKeywordFilters() ?? [],
      };

      // Read dmEnabled from connector config if available
      const connConfig = ctx.engine.getConnectorConfig?.(slackStatus.id);
      if (connConfig?.settings) {
        connectorData.dmEnabled = connConfig.settings.dmEnabled ?? false;
      }
    }

    // --- Bridge state ---
    let bridgeData: Record<string, unknown> | null = null;

    const bridge = ctx.slackBridge;
    if (bridge) {
      const config = bridge.getConfig();
      const sessionThreads = bridge.getSessionThreads();
      const threadToSession = bridge.getThreadToSession();

      const sessionThreadsObj: Record<string, { threadTs: string; lastMessageAt: string }> = {};
      for (const [id, mapping] of sessionThreads) {
        sessionThreadsObj[id] = {
          threadTs: mapping.threadTs,
          lastMessageAt: new Date(mapping.lastMessageAt).toISOString(),
        };
      }

      bridgeData = {
        enabled: config.enabled,
        targetChannel: config.targetChannel,
        forwardStop: config.forwardStop,
        forwardSubagentStop: config.forwardSubagentStop,
        forwardTaskComplete: config.forwardTaskComplete,
        forwardToolUse: config.forwardToolUse,
        forwardNeedsInput: config.forwardNeedsInput,
        forwardUserPrompt: config.forwardUserPrompt,
        threadingMode: config.threadingMode,
        maxThreadMessages: config.maxThreadMessages,
        reverseEnabled: config.reverseEnabled,
        maxMessageLength: config.maxMessageLength,
        sessionThreads: sessionThreadsObj,
        threadToSession: Object.fromEntries(threadToSession),
        pendingBatches: bridge.getPendingBatchSessions(),
        botUserId: bridge.getBotUserId(),
      };
    }

    // --- Channel logger state ---
    let channelLoggerData: Record<string, unknown> | null = null;

    if (ctx.config.slackBridge?.enabled || slackStatus) {
      channelLoggerData = {
        logDir: '~/.idashboard/logs/slack/',
      };
    }

    return reply.send({
      ok: true,
      data: {
        connector: connectorData,
        bridge: bridgeData,
        channelLogger: channelLoggerData,
      },
    });
  });
}
