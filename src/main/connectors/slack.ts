// ============================================================
// Slack Connector - Bidirectional channel monitoring + messaging
// ============================================================

import { BaseConnector } from './base';
import { log, warn } from '@main/utils/log';
import type { ConnectorCapability, ConnectorEvent, ConnectorAction } from '@shared/types';
import type { SlackChannelLogger } from '@main/services/slack-channel-logger';

interface SlackMessage {
  ts: string;
  type: string;
  text: string;
  user?: string;
  channel?: string;
  thread_ts?: string;
  reply_count?: number;
  latest_reply?: string;
}

interface SlackHistoryResponse {
  ok: boolean;
  messages?: SlackMessage[];
  has_more?: boolean;
  error?: string;
}

interface SlackPostResponse {
  ok: boolean;
  ts?: string;
  error?: string;
}

interface SlackAuthResponse {
  ok: boolean;
  user_id?: string;
  error?: string;
}

interface SlackUserInfoResponse {
  ok: boolean;
  user?: {
    id: string;
    name: string;
    real_name?: string;
    profile?: { display_name?: string; real_name?: string };
  };
  error?: string;
}

interface SlackConversationsOpenResponse {
  ok: boolean;
  channel?: { id: string };
  error?: string;
}

interface SlackChannel {
  id: string;
  name: string;
}

interface SlackConversationsListResponse {
  ok: boolean;
  channels?: SlackChannel[];
  error?: string;
  response_metadata?: { next_cursor?: string };
}

export class SlackConnector extends BaseConnector {
  readonly type = 'slack';
  readonly capabilities: ConnectorCapability[] = ['pull', 'action'];

  private channels: string[] = [];
  private channelIds = new Map<string, string>(); // name → Slack channel ID
  private userNames = new Map<string, string>();   // user ID → display name
  private keywordFilters: string[] = [];
  private mentionAlerts = false;
  private lastTimestamps = new Map<string, string>();
  private activeThreads = new Map<string, string>(); // "channelId:threadTs" → last seen reply ts
  private dmEnabled = false;
  private botUserId: string | null = null;
  private dmChannelId: string | null = null;        // legacy single-DM (self)
  private dmChannels = new Map<string, string>();    // DM channel ID → other user ID
  private channelLogger: SlackChannelLogger | null = null;

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);
    this.channels = (this.config.settings.channels as string[]) ?? [];
    this.keywordFilters = (this.config.settings.keywordFilters as string[]) ?? [];
    this.mentionAlerts = (this.config.settings.mentionAlerts as boolean) ?? false;
    this.dmEnabled = (this.config.settings.dmEnabled as boolean) ?? false;

    // Always resolve bot user ID (needed to filter out own messages from polls)
    await this.resolveBotUserId();

    // Resolve channel names to IDs (conversations.history requires IDs)
    await this.resolveChannelIds();

    if (this.dmEnabled) {
      await this.resolveDmChannel();
    }
  }

  override async poll(): Promise<ConnectorEvent[]> {
    const events: ConnectorEvent[] = [];
    log('Slack', `Polling ${this.channels.length} channel(s): ${this.channels.join(', ')}`);

    for (const channel of this.channels) {
      const channelName = channel.replace(/^#/, '');
      const channelId = this.channelIds.get(channelName) ?? channelName;
      const messages = await this.fetchMessages(channelId);
      log('Slack', `Channel ${channelName} (${channelId}): fetched ${messages.length} message(s)`);

      for (const msg of messages) {
        // Skip bot's own messages (sent via iDashboard)
        if (this.botUserId && msg.user === this.botUserId) continue;

        const matchedKeyword = this.matchesFilters(msg.text);
        if (!matchedKeyword && !this.isMention(msg.text)) {
          log('Slack', `Skipping message (no keyword/mention match): "${msg.text.slice(0, 60)}"`);
          continue;
        }

        const isMention = this.isMention(msg.text);
        const userName = msg.user ? await this.resolveUserName(msg.user) : undefined;
        const resolvedText = await this.resolveTextMentions(msg.text);

        this.channelLogger?.logReceived(channelName, userName ?? msg.user ?? '?', resolvedText, msg.ts, msg.thread_ts);

        events.push(this.createEvent({
          severity: isMention ? 'attention' : 'info',
          title: `Slack: ${channel}`,
          body: resolvedText.slice(0, 300),
          category: 'notification',
          eventType: isMention ? 'mention-received' : 'message-received',
          externalId: `slack-${channelName}-${msg.ts}`,
          metadata: {
            channel: channelName,
            channelId,
            user: userName ?? msg.user,
            userId: msg.user,
            ts: msg.ts,
            threadTs: msg.thread_ts,
            matchedKeyword,
          },
          uiHints: {
            icon: 'message-square',
            color: isMention ? '#e01e5a' : '#611f69',
            blinkDurationMs: isMention ? 15_000 : undefined,
          },
        }));
      }
    }

    // Poll DM channels if enabled
    if (this.dmEnabled && this.dmChannels.size > 0) {
      for (const [dmChId, otherUserId] of this.dmChannels) {
        const dmMessages = await this.fetchMessages(dmChId);

        for (const msg of dmMessages) {
          // Skip bot's own messages
          if (msg.user === this.botUserId) continue;

          const userName = msg.user ? await this.resolveUserName(msg.user) : undefined;
          const dmLabel = userName ?? otherUserId;
          const resolvedText = await this.resolveTextMentions(msg.text);

          events.push(this.createEvent({
            severity: 'info',
            title: `DM: ${dmLabel}`,
            body: resolvedText.slice(0, 300),
            category: 'notification',
            eventType: 'dm-received',
            externalId: `slack-dm-${dmChId}-${msg.ts}`,
            metadata: {
              isDM: true,
              dmChannelId: dmChId,
              channel: `DM:${dmLabel}`,
              user: userName ?? msg.user,
              userId: msg.user,
              ts: msg.ts,
              threadTs: msg.thread_ts,
            },
            uiHints: {
              icon: 'message-square',
              color: '#1264a3',
              actionButtons: [
                { id: 'reply-dm', label: 'Reply', icon: 'reply' },
              ],
            },
          }));
        }
      }
    }

    return events;
  }

  override getActions(): ConnectorAction[] {
    return [
      { id: 'send-message', label: 'Send to Slack', icon: 'message-square' },
      { id: 'reply-dm', label: 'Reply to DM', icon: 'reply' },
    ];
  }

  override async executeAction(actionId: string, params?: unknown): Promise<void> {
    if (actionId === 'send-message') {
      const { channel, text, threadTs } = params as { channel: string; text: string; threadTs?: string };
      const result = await this.sendMessage(channel, text, threadTs);
      if (!result.ok) {
        throw new Error(`Slack send failed: ${result.error ?? 'unknown error'}`);
      }
    } else if (actionId === 'reply-dm') {
      const { text, threadTs, dmChannelId } = params as { text: string; threadTs?: string; dmChannelId?: string };
      const targetChannel = dmChannelId || this.dmChannelId;
      if (!targetChannel) {
        throw new Error('DM channel not resolved');
      }
      const result = await this.sendMessage(targetChannel, text, threadTs);
      if (!result.ok) {
        throw new Error(`Slack DM reply failed: ${result.error ?? 'unknown error'}`);
      }
    }
  }

  /** Send a message to a Slack channel */
  async sendMessage(channel: string, text: string, threadTs?: string, attachmentColor?: string): Promise<SlackPostResponse> {
    const body: Record<string, unknown> = { channel };

    if (attachmentColor) {
      // Use attachment with colored left sidebar
      body.attachments = [{ text, color: attachmentColor, mrkdwn_in: ['text'] }];
    } else {
      body.text = text;
    }

    if (threadTs) body.thread_ts = threadTs;

    this.channelLogger?.logSent(channel, text, threadTs);

    const resp = await this.fetchWithAuth('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = `HTTP ${resp.status}`;
      this.channelLogger?.logSendResult(channel, false, undefined, error);
      return { ok: false, error };
    }

    const data = await resp.json() as SlackPostResponse;
    this.channelLogger?.logSendResult(channel, data.ok, data.ts, data.error);

    // Track the sent message as an active thread so replies get polled
    if (data.ok && data.ts) {
      const channelId = this.channelIds.get(channel.replace(/^#/, '')) ?? channel;
      const threadKey = `${channelId}:${data.ts}`;
      this.activeThreads.set(threadKey, data.ts);
      log('Slack', `Tracking sent message as thread: ${threadKey}`);
    }

    return data;
  }

  /** Expose monitored channel list for UI (includes DM channels) */
  getMonitoredChannels(): string[] {
    return [...this.channels];
  }

  /** Expose DM channel map for UI */
  getDmChannels(): Map<string, string> {
    return new Map(this.dmChannels);
  }

  /** Get the resolved DM channel ID (null if not enabled or not resolved) */
  getDmChannelId(): string | null {
    return this.dmChannelId;
  }

  /** Get the bot's own user ID (null if not resolved) */
  getBotUserId(): string | null {
    return this.botUserId;
  }

  /** Attach a channel logger for detailed per-channel logging */
  setChannelLogger(logger: SlackChannelLogger): void {
    this.channelLogger = logger;
  }

  // ─── Debug getters ─────────────────────────────────────

  /** Returns channel name → Slack channel ID map */
  getChannelIds(): Record<string, string> {
    return Object.fromEntries(this.channelIds);
  }

  /** Returns per-channel polling cursors (channel ID → last timestamp) */
  getLastTimestamps(): Record<string, string> {
    return Object.fromEntries(this.lastTimestamps);
  }

  /** Returns active thread tracking map ("channelId:threadTs" → last seen reply ts) */
  getActiveThreads(): Record<string, string> {
    return Object.fromEntries(this.activeThreads);
  }

  /** Returns the number of cached user names */
  getUserNameCacheSize(): number {
    return this.userNames.size;
  }

  /** Returns configured keyword filters */
  getKeywordFilters(): string[] {
    return [...this.keywordFilters];
  }

  /** Resolve configured channel names (e.g. "general") to Slack channel IDs (e.g. "C08...") */
  private async resolveChannelIds(): Promise<void> {
    const namesToResolve = this.channels.map(ch => ch.replace(/^#/, ''));
    if (namesToResolve.length === 0) return;

    log('Slack', `Resolving ${namesToResolve.length} channel name(s) to IDs...`);

    // Try conversations.list (needs channels:read; only returns channels bot is a member of)
    try {
      let cursor: string | undefined;
      do {
        const params = new URLSearchParams({ limit: '200', types: 'public_channel,private_channel' });
        if (cursor) params.set('cursor', cursor);

        const resp = await this.fetchWithAuth(
          `https://slack.com/api/conversations.list?${params.toString()}`,
        );

        if (!resp.ok) {
          warn('Slack', `conversations.list HTTP ${resp.status}`);
          break;
        }

        const data = await resp.json() as SlackConversationsListResponse;
        if (!data.ok) {
          warn('Slack', `conversations.list API error: ${data.error ?? 'unknown'}`);
          break;
        }

        if (data.channels) {
          for (const ch of data.channels) {
            this.channelIds.set(ch.name, ch.id);
          }
          log('Slack', `conversations.list page returned ${data.channels.length} channel(s)`);
        }
        cursor = data.response_metadata?.next_cursor || undefined;
      } while (cursor);
    } catch (err) {
      warn('Slack', `conversations.list failed: ${err}`);
    }

    for (const name of namesToResolve) {
      // If the value already looks like a Slack channel ID, use it as-is
      if (/^[CDG][A-Z0-9]{8,}$/.test(name)) {
        log('Slack', `Channel ${name} looks like an ID, using directly`);
        this.channelIds.set(name, name);
        continue;
      }

      const id = this.channelIds.get(name);
      if (id) {
        log('Slack', `Resolved #${name} → ${id}`);
      } else {
        // conversations.list only returns channels the bot is a member of.
        // If unresolved, the bot probably hasn't been /invite'd to this channel.
        warn('Slack', `Could not resolve #${name}. The bot must be invited to the channel (/invite @BotName). Alternatively, use the channel ID directly in config.`);
      }
    }
  }

  /** Resolve the bot's own user ID via auth.test (needed to filter own messages) */
  private async resolveBotUserId(): Promise<void> {
    try {
      const authResp = await this.fetchWithAuth('https://slack.com/api/auth.test');
      if (!authResp.ok) return;

      const authData = await authResp.json() as SlackAuthResponse;
      if (!authData.ok || !authData.user_id) return;

      this.botUserId = authData.user_id;
      log('Slack', `Bot user ID resolved: ${this.botUserId}`);
    } catch {
      warn('Slack', 'Could not resolve bot user ID — own messages will not be filtered');
    }
  }

  /** Discover all DM (IM) channels the bot is part of, and open new ones for configured targets */
  private async resolveDmChannel(): Promise<void> {
    if (!this.botUserId) return;

    // 1. Discover existing IM channels via conversations.list
    try {
      const params = new URLSearchParams({ limit: '100', types: 'im' });
      const resp = await this.fetchWithAuth(
        `https://slack.com/api/conversations.list?${params.toString()}`,
      );
      if (!resp.ok) {
        warn('Slack', `DM conversations.list HTTP ${resp.status}`);
      } else {
        const data = await resp.json() as SlackConversationsListResponse;
        if (!data.ok) {
          warn('Slack', `DM conversations.list error: ${data.error ?? 'unknown'} — need im:read scope`);
        } else {
          interface IMChannel { id: string; user?: string; name?: string; }
          const imChannels = (data.channels ?? []) as IMChannel[];

          for (const im of imChannels) {
            const otherUser = im.user ?? im.name ?? 'unknown';
            // Skip DM with bot itself
            if (otherUser === this.botUserId) continue;
            this.dmChannels.set(im.id, otherUser);
          }
          log('Slack', `Discovered ${this.dmChannels.size} existing DM channel(s)`);
        }
      }
    } catch (err) {
      warn('Slack', `DM channel discovery failed: ${err}`);
    }

    // 2. Open DM channels for explicitly configured user IDs (dmUsers setting)
    const dmUsers = (this.config.settings.dmUsers as string[]) ?? [];
    for (const userId of dmUsers) {
      // Skip if we already discovered a DM with this user
      const alreadyTracked = [...this.dmChannels.values()].includes(userId);
      if (alreadyTracked) {
        log('Slack', `DM with ${userId} already discovered, skipping open`);
        continue;
      }

      try {
        const opened = await this.openDmChannel(userId);
        if (opened) {
          this.dmChannels.set(opened, userId);
          log('Slack', `Opened DM channel ${opened} with user ${userId}`);
        }
      } catch (err) {
        warn('Slack', `Failed to open DM with ${userId}: ${err}`);
      }
    }

    log('Slack', `Total DM channels: ${this.dmChannels.size}`);

    // Keep legacy dmChannelId for the reply-dm action (use first DM found)
    const first = this.dmChannels.keys().next();
    if (!first.done) this.dmChannelId = first.value;
  }

  /** Open a DM channel with a specific user via conversations.open */
  private async openDmChannel(userId: string): Promise<string | null> {
    const resp = await this.fetchWithAuth('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ users: userId }),
    });

    if (!resp.ok) {
      warn('Slack', `conversations.open HTTP ${resp.status} for ${userId}`);
      return null;
    }

    const data = await resp.json() as SlackConversationsOpenResponse;
    if (!data.ok || !data.channel?.id) {
      warn('Slack', `conversations.open error for ${userId}: ${data.error ?? 'unknown'}`);
      return null;
    }

    return data.channel.id;
  }

  private static readonly USER_CACHE_MAX = 500;

  /** Resolve a Slack user ID to a display name, with caching */
  private async resolveUserName(userId: string): Promise<string | undefined> {
    const cached = this.userNames.get(userId);
    if (cached) {
      // Move to end (most-recently-used) by re-inserting
      this.userNames.delete(userId);
      this.userNames.set(userId, cached);
      return cached;
    }

    try {
      const resp = await this.fetchWithAuth(
        `https://slack.com/api/users.info?user=${userId}`,
      );
      if (!resp.ok) {
        warn('Slack', `users.info HTTP ${resp.status} for ${userId}`);
        return undefined;
      }

      const data = await resp.json() as SlackUserInfoResponse;
      if (!data.ok || !data.user) {
        warn('Slack', `users.info error for ${userId}: ${data.error ?? 'no user'} — add users:read scope to bot`);
        return undefined;
      }

      // Slack can return empty string for display_name, so filter those out
      const name = data.user.profile?.display_name?.trim()
        || data.user.real_name?.trim()
        || data.user.profile?.real_name?.trim()
        || data.user.name;

      if (name) {
        this.userNames.set(userId, name);
        // Evict oldest entries when cache exceeds max size
        if (this.userNames.size > SlackConnector.USER_CACHE_MAX) {
          const first = this.userNames.keys().next();
          if (!first.done) this.userNames.delete(first.value);
        }
        log('Slack', `Resolved user ${userId} → ${name}`);
      }
      return name;
    } catch (err) {
      warn('Slack', `users.info failed for ${userId}: ${err}`);
      return undefined;
    }
  }

  private async fetchMessages(channelId: string): Promise<SlackMessage[]> {
    const oldest = this.lastTimestamps.get(channelId);
    const params = new URLSearchParams({
      channel: channelId,
      limit: '20',
    });
    if (oldest) params.set('oldest', oldest);

    log('Slack', `Fetching history for ${channelId} (oldest=${oldest ?? 'none'})`);

    const resp = await this.fetchWithAuth(
      `https://slack.com/api/conversations.history?${params.toString()}`,
    );

    if (!resp.ok) {
      warn('Slack', `HTTP error fetching ${channelId}: ${resp.status} ${resp.statusText}`);
      return [];
    }

    const data = await resp.json() as SlackHistoryResponse;
    if (!data.ok) {
      warn('Slack', `Slack API error for ${channelId}: ${data.error ?? 'unknown'}`);
      return [];
    }

    const allMessages: SlackMessage[] = [];

    // Process new top-level messages
    if (data.messages?.length) {
      log('Slack', `Got ${data.messages.length} message(s) from ${channelId}`);
      allMessages.push(...data.messages);

      // Track threads from new messages
      for (const msg of data.messages) {
        if (msg.reply_count && msg.reply_count > 0) {
          const threadKey = `${channelId}:${msg.ts}`;
          if (!this.activeThreads.has(threadKey)) {
            this.activeThreads.set(threadKey, oldest ?? '0');
            log('Slack', `Tracking new thread ${msg.ts} in ${channelId}`);
          }
          // Fetch replies for newly discovered threads
          const replies = await this.fetchThreadReplies(channelId, msg.ts, oldest);
          allMessages.push(...replies);
        }
      }
    } else {
      log('Slack', `No new top-level messages in ${channelId}`);
    }

    // Poll known active threads for new replies (even if no new top-level messages)
    for (const [threadKey, lastReplyTs] of this.activeThreads) {
      const [thChId, threadTs] = threadKey.split(':');
      if (thChId !== channelId) continue;

      // Skip threads we just fetched above (already handled)
      if (data.messages?.some(m => m.ts === threadTs)) continue;

      const replies = await this.fetchThreadReplies(channelId, threadTs, lastReplyTs);
      if (replies.length > 0) {
        allMessages.push(...replies);
      }
    }

    // Update cursors
    if (allMessages.length > 0) {
      const newestTs = allMessages.reduce((max, m) => m.ts > max ? m.ts : max, oldest ?? '0');
      if (newestTs !== '0') this.lastTimestamps.set(channelId, newestTs);

      // Update per-thread cursors for replies we fetched
      for (const msg of allMessages) {
        if (msg.thread_ts && msg.ts !== msg.thread_ts) {
          const threadKey = `${channelId}:${msg.thread_ts}`;
          const prev = this.activeThreads.get(threadKey) ?? '0';
          if (msg.ts > prev) this.activeThreads.set(threadKey, msg.ts);
        }
      }
    }

    // Cap tracked threads per channel (keep 50 most recent)
    const channelThreads = [...this.activeThreads.entries()]
      .filter(([k]) => k.startsWith(`${channelId}:`))
      .sort(([, a], [, b]) => b.localeCompare(a));
    if (channelThreads.length > 50) {
      for (const [key] of channelThreads.slice(50)) {
        this.activeThreads.delete(key);
      }
    }

    return allMessages;
  }

  /** Fetch replies in a thread, excluding the parent message */
  private async fetchThreadReplies(channelId: string, threadTs: string, oldest?: string): Promise<SlackMessage[]> {
    const params = new URLSearchParams({
      channel: channelId,
      ts: threadTs,
      limit: '20',
    });
    if (oldest) params.set('oldest', oldest);

    const resp = await this.fetchWithAuth(
      `https://slack.com/api/conversations.replies?${params.toString()}`,
    );

    if (!resp.ok) {
      warn('Slack', `conversations.replies HTTP ${resp.status} for thread ${threadTs}`);
      return [];
    }

    const data = await resp.json() as SlackHistoryResponse;
    if (!data.ok) {
      warn('Slack', `conversations.replies error for thread ${threadTs}: ${data.error ?? 'unknown'}`);
      return [];
    }

    // conversations.replies includes the parent as first message — skip it
    const replies = (data.messages ?? []).filter(m => m.ts !== threadTs);
    if (replies.length > 0) {
      log('Slack', `Fetched ${replies.length} thread reply(ies) for ${threadTs}`);
    }
    return replies;
  }

  private matchesFilters(text: string): string | null {
    if (this.keywordFilters.length === 0) return 'all';
    const lower = text.toLowerCase();
    return this.keywordFilters.find(kw => lower.includes(kw.toLowerCase())) ?? null;
  }

  private isMention(text: string): boolean {
    if (!this.mentionAlerts) return false;
    // Slack mentions look like <@U12345>
    return /<@\w+>/.test(text);
  }

  /** Replace <@USERID> mentions in text with resolved display names */
  private async resolveTextMentions(text: string): Promise<string> {
    const mentionPattern = /<@(\w+)>/g;
    const matches = [...text.matchAll(mentionPattern)];
    if (matches.length === 0) return text;

    let result = text;
    for (const match of matches) {
      const userId = match[1];
      const name = await this.resolveUserName(userId);
      if (name) {
        result = result.replace(match[0], `@${name}`);
      }
    }
    return result;
  }
}
