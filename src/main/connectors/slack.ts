// ============================================================
// Slack Connector - Pull-based channel monitoring
// ============================================================

import { BaseConnector } from './base';
import type { ConnectorCapability, ConnectorEvent } from '@shared/types';

interface SlackMessage {
  ts: string;
  type: string;
  text: string;
  user?: string;
  channel?: string;
  thread_ts?: string;
}

interface SlackHistoryResponse {
  ok: boolean;
  messages?: SlackMessage[];
  has_more?: boolean;
  error?: string;
}

export class SlackConnector extends BaseConnector {
  readonly type = 'slack';
  readonly capabilities: ConnectorCapability[] = ['pull'];

  private channels: string[] = [];
  private keywordFilters: string[] = [];
  private mentionAlerts = false;
  private lastTimestamps = new Map<string, string>();

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);
    this.channels = (this.config.settings.channels as string[]) ?? [];
    this.keywordFilters = (this.config.settings.keywordFilters as string[]) ?? [];
    this.mentionAlerts = (this.config.settings.mentionAlerts as boolean) ?? false;
  }

  override async poll(): Promise<ConnectorEvent[]> {
    const events: ConnectorEvent[] = [];

    for (const channel of this.channels) {
      const channelId = channel.replace(/^#/, '');
      const messages = await this.fetchMessages(channelId);

      for (const msg of messages) {
        const matchedKeyword = this.matchesFilters(msg.text);
        if (!matchedKeyword && !this.isMention(msg.text)) continue;

        const isMention = this.isMention(msg.text);

        events.push(this.createEvent({
          severity: isMention ? 'attention' : 'info',
          title: `Slack: ${channel}`,
          body: msg.text.slice(0, 300),
          category: 'notification',
          eventType: isMention ? 'mention-received' : 'message-received',
          externalId: `slack-${channelId}-${msg.ts}`,
          metadata: {
            channel: channelId,
            user: msg.user,
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

    return events;
  }

  private async fetchMessages(channelId: string): Promise<SlackMessage[]> {
    const oldest = this.lastTimestamps.get(channelId);
    const params = new URLSearchParams({
      channel: channelId,
      limit: '20',
    });
    if (oldest) params.set('oldest', oldest);

    const resp = await this.fetchWithAuth(
      `https://slack.com/api/conversations.history?${params.toString()}`,
    );

    if (!resp.ok) return [];

    const data = await resp.json() as SlackHistoryResponse;
    if (!data.ok || !data.messages?.length) return [];

    // Update cursor to newest message
    const newestTs = data.messages[0]?.ts;
    if (newestTs) this.lastTimestamps.set(channelId, newestTs);

    return data.messages;
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
}
