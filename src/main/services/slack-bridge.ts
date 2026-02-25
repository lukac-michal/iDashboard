// ============================================================
// SlackBridgeService - Bidirectional Claude Code <-> Slack bridge
// Forward direction: Claude Code output → Slack (thread per session)
// Reverse direction: Slack thread replies → Claude Code terminal input
// ============================================================

import { log, warn } from '@main/utils/log';
import type { ConnectorEvent, AppConfig } from '@shared/types';
import type { ConnectorEngine } from '@main/connectors/engine';
import type { SlackConnector } from '@main/connectors/slack';
import type { TerminalAdapter } from './terminal-adapter';
import type { SlackChannelLogger } from './slack-channel-logger';

interface ThreadMapping {
  threadTs: string;
  lastMessageAt: number;
  messageCount: number;
}

interface PendingBatch {
  messages: string[];
  timer: ReturnType<typeof setTimeout>;
}

const DEBOUNCE_MS = 2000;
const BRIDGE_COLOR = '#f97316'; // orange sidebar for bridge messages in Slack

export class SlackBridgeService {
  private sessionThreads = new Map<string, ThreadMapping>();
  private threadToSession = new Map<string, string>(); // reverse: threadTs → sessionId
  private pendingBatches = new Map<string, PendingBatch>();
  private config: AppConfig['slackBridge'];
  private engine: ConnectorEngine;
  private terminal: TerminalAdapter | null;
  private botUserId: string | null = null;
  private channelLogger: SlackChannelLogger | null = null;

  constructor(
    engine: ConnectorEngine,
    config: AppConfig['slackBridge'],
    terminal?: TerminalAdapter | null,
    channelLogger?: SlackChannelLogger | null,
  ) {
    this.engine = engine;
    this.config = config;
    this.terminal = terminal ?? null;
    this.channelLogger = channelLogger ?? null;
  }

  updateConfig(config: AppConfig['slackBridge']): void {
    this.config = config;
  }

  /** Set the bot user ID so we can filter out our own messages in reverse direction */
  setBotUserId(userId: string): void {
    this.botUserId = userId;
  }

  // ─── Forward: Claude Code → Slack ────────────────────────

  /** Process an outbound event — returns true if it was a bridge event and was handled */
  handleEvent(event: ConnectorEvent): boolean {
    if (!this.config.enabled) return false;
    if (!this.config.targetChannel) {
      warn('SlackBridge', 'No target channel configured');
      return false;
    }

    // Only forward events from non-Slack connectors (avoid loops)
    if (!event.connectorId || event.connectorId.startsWith('slack')) return false;

    // Per-event-type forwarding toggles
    const typeToggleMap: Record<string, keyof AppConfig['slackBridge']> = {
      'output-stop': 'forwardStop',
      'output-subagent-stop': 'forwardSubagentStop',
      'task-complete': 'forwardTaskComplete',
      'output-tool-use': 'forwardToolUse',
      'needs-input': 'forwardNeedsInput',
      'user-prompt': 'forwardUserPrompt',
    };
    const toggleKey = typeToggleMap[event.eventType ?? ''];
    if (toggleKey && !this.config[toggleKey]) return false;

    const sessionId = (event.metadata?.sessionId as string) ?? 'unknown';
    const eventType = event.eventType ?? '';
    const text = this.formatOutboundMessage(event);

    // Tool-use events get debounced/batched
    if (event.eventType === 'output-tool-use') {
      this.enqueueBatch(sessionId, text, eventType);
    } else {
      // Other messages send immediately
      this.sendToSlack(sessionId, text, eventType);
    }

    return true;
  }

  // ─── Reverse: Slack → Claude Code ────────────────────────

  /** Process an inbound Slack event — returns true if it was routed to a terminal */
  handleInboundEvent(event: ConnectorEvent): boolean {
    if (!this.config.enabled || !this.config.reverseEnabled) return false;
    if (!this.terminal) return false;

    // Only handle Slack message events
    const eventType = event.eventType;
    if (eventType !== 'message-received' && eventType !== 'mention-received') return false;

    // Check the message is from the bridge target channel
    if (!this.isFromBridgeChannel(event)) return false;

    // Check the message is a thread reply in one of our bridge threads
    const threadTs = event.metadata?.threadTs as string | undefined;
    if (!threadTs) return false;

    const sessionId = this.threadToSession.get(threadTs);
    if (!sessionId) return false;

    // Skip if this is the bot's own message echoed back
    const userId = event.metadata?.userId as string | undefined;
    if (this.botUserId && userId === this.botUserId) return false;

    const text = event.body ?? '';
    if (!text.trim()) return false;

    const user = (event.metadata?.user as string) ?? 'Slack';
    log('SlackBridge', `Reverse bridge: ${user} → session "${sessionId}": "${text.slice(0, 80)}"`);

    this.channelLogger?.logBridgeReverse(this.config.targetChannel, sessionId, user, text);

    this.sendToTerminal(sessionId, text);
    return true;
  }

  private isFromBridgeChannel(event: ConnectorEvent): boolean {
    const target = this.config.targetChannel.replace(/^#/, '');
    const eventChannel = (event.metadata?.channel as string) ?? '';
    const eventChannelId = (event.metadata?.channelId as string) ?? '';

    // Match by name (without #) or by channel ID
    return eventChannel === target || eventChannelId === target;
  }

  private async sendToTerminal(sessionId: string, text: string): Promise<void> {
    if (!this.terminal) return;

    try {
      const session = await this.terminal.findSession(sessionId);
      if (!session) {
        warn('SlackBridge', `Terminal session "${sessionId}" not found — cannot forward Slack message`);
        return;
      }

      await this.terminal.writeText(session, text);
      log('SlackBridge', `Typed into session "${sessionId}"`);
    } catch (err) {
      warn('SlackBridge', `Failed to type into terminal: ${err}`);
    }
  }

  // ─── Outbound helpers ────────────────────────────────────

  private formatOutboundMessage(event: ConnectorEvent): string {
    const body = event.body ?? '';
    const maxLen = this.config.maxMessageLength;

    let text: string;

    if (event.eventType === 'output-tool-use') {
      const toolName = (event.metadata?.toolName as string) ?? 'unknown';
      text = `*[${toolName}]* ${body}`;
    } else if (event.eventType === 'output-subagent-stop') {
      text = `*Subagent finished:*\n${body}`;
    } else if (event.eventType === 'needs-input') {
      text = `:bell: *Waiting for input*`;
    } else if (event.eventType === 'task-complete') {
      text = `:white_check_mark: *Task completed*${body ? `\n${body}` : ''}`;
    } else if (event.eventType === 'user-prompt') {
      text = `:speech_balloon: *User prompt:*\n${body}`;
    } else {
      text = body || event.title;
    }

    // Truncate if needed
    if (text.length > maxLen) {
      text = text.slice(0, maxLen - 20) + '\n\n... (truncated)';
    }

    return text;
  }

  private enqueueBatch(sessionId: string, text: string, eventType: string): void {
    const existing = this.pendingBatches.get(sessionId);
    if (existing) {
      existing.messages.push(text);
      return;
    }

    const batch: PendingBatch = {
      messages: [text],
      timer: setTimeout(() => {
        this.flushBatch(sessionId, eventType);
      }, DEBOUNCE_MS),
    };
    this.pendingBatches.set(sessionId, batch);
  }

  private flushBatch(sessionId: string, eventType: string): void {
    const batch = this.pendingBatches.get(sessionId);
    if (!batch) return;
    this.pendingBatches.delete(sessionId);

    const combined = batch.messages.join('\n---\n');
    const maxLen = this.config.maxMessageLength;
    const text = combined.length > maxLen
      ? combined.slice(0, maxLen - 20) + '\n\n... (truncated)'
      : combined;

    this.sendToSlack(sessionId, text, eventType);
  }

  private shouldStartNewThread(mapping: ThreadMapping | undefined, eventType: string): boolean {
    if (!mapping) return true;
    if (mapping.messageCount >= this.config.maxThreadMessages) return true;
    if (this.config.threadingMode === 'per-interaction') {
      if (eventType === 'user-prompt' || eventType === 'needs-input') return true;
    }
    return false;
  }

  private async sendToSlack(sessionId: string, text: string, eventType: string = ''): Promise<void> {
    const slackConnector = this.findSlackConnector();
    if (!slackConnector) {
      warn('SlackBridge', 'No Slack connector available');
      return;
    }

    // Capture bot user ID for reverse-direction filtering
    if (!this.botUserId) {
      const uid = slackConnector.getBotUserId();
      if (uid) this.botUserId = uid;
    }

    const channel = this.config.targetChannel;
    const existing = this.sessionThreads.get(sessionId);
    const startNew = this.shouldStartNewThread(existing, eventType);

    this.channelLogger?.logBridgeForward(channel, sessionId, 'outbound', text);

    try {
      if (existing && !startNew) {
        // Reply in thread
        const result = await slackConnector.sendMessage(channel, text, existing.threadTs, BRIDGE_COLOR);
        this.channelLogger?.logSendResult(channel, result.ok, result.ts, result.error);
        if (result.ok) {
          existing.lastMessageAt = Date.now();
          existing.messageCount++;
          log('SlackBridge', `Thread reply sent for session ${sessionId}`);
        } else {
          warn('SlackBridge', `Thread reply failed: ${result.error}`);
        }
      } else {
        // New thread — prepend session header
        const headerText = `*Session:* \`${sessionId}\`\n\n${text}`;
        const result = await slackConnector.sendMessage(channel, headerText, undefined, BRIDGE_COLOR);
        this.channelLogger?.logSendResult(channel, result.ok, result.ts, result.error);
        if (result.ok && result.ts) {
          // Clean up old reverse mapping if rotating thread
          if (existing) {
            this.threadToSession.delete(existing.threadTs);
          }
          this.sessionThreads.set(sessionId, {
            threadTs: result.ts,
            lastMessageAt: Date.now(),
            messageCount: 1,
          });
          this.threadToSession.set(result.ts, sessionId);
          log('SlackBridge', `New thread created for session ${sessionId}: ${result.ts}`);
        } else {
          warn('SlackBridge', `Initial message failed: ${result.error}`);
        }
      }
    } catch (err) {
      warn('SlackBridge', `Send failed: ${err}`);
      this.channelLogger?.logInfo(channel, `SEND_ERROR: ${err}`);
    }
  }

  private findSlackConnector(): SlackConnector | null {
    const statuses = this.engine.getStatuses();
    const slackStatus = statuses.find(s => s.type === 'slack' && s.connected);
    if (!slackStatus) return null;
    return this.engine.getConnector(slackStatus.id) as SlackConnector | null;
  }

  /** Get the thread mapping (for testing) */
  getSessionThreads(): Map<string, ThreadMapping> {
    return new Map(this.sessionThreads);
  }

  /** Get the reverse map (for testing) */
  getThreadToSession(): Map<string, string> {
    return new Map(this.threadToSession);
  }

  /** Returns list of sessions with pending debouncing batches */
  getPendingBatchSessions(): Array<{ session: string; messageCount: number }> {
    return [...this.pendingBatches.entries()].map(([session, batch]) => ({
      session,
      messageCount: batch.messages.length,
    }));
  }

  /** Returns the current bridge config */
  getConfig(): AppConfig['slackBridge'] {
    return this.config;
  }

  /** Returns the cached bot user ID */
  getBotUserId(): string | null {
    return this.botUserId;
  }

  destroy(): void {
    for (const batch of this.pendingBatches.values()) {
      clearTimeout(batch.timer);
    }
    this.pendingBatches.clear();
  }
}
