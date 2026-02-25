// ============================================================
// SlackBridgeService Unit Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlackBridgeService } from '@main/services/slack-bridge';
import type { ConnectorEvent, AppConfig } from '@shared/types';
import type { ConnectorEngine } from '@main/connectors/engine';
import type { TerminalAdapter, TerminalSession } from '@main/services/terminal-adapter';

// Suppress log output in tests
vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

function createMockEngine(slackConnected = true): ConnectorEngine & { mockSendMessage: ReturnType<typeof vi.fn> } {
  const mockSendMessage = vi.fn().mockResolvedValue({ ok: true, ts: '1234567890.123456' });

  const mockSlackConnector = {
    type: 'slack',
    sendMessage: mockSendMessage,
    getBotUserId: vi.fn().mockReturnValue(null),
  };

  return {
    mockSendMessage,
    getStatuses: vi.fn().mockReturnValue(
      slackConnected
        ? [{ id: 'slack-1', type: 'slack', displayName: 'Slack', connected: true, eventCount: 0 }]
        : [],
    ),
    getConnector: vi.fn().mockReturnValue(slackConnected ? mockSlackConnector : null),
  } as unknown as ConnectorEngine & { mockSendMessage: ReturnType<typeof vi.fn> };
}

function createMockTerminal(): TerminalAdapter & { mockWriteText: ReturnType<typeof vi.fn>; mockFindSession: ReturnType<typeof vi.fn> } {
  const mockWriteText = vi.fn().mockResolvedValue(undefined);
  const mockFindSession = vi.fn().mockResolvedValue({ name: 'test-project', windowId: 1, tabId: 1 } as TerminalSession);

  return {
    mockWriteText,
    mockFindSession,
    isRunning: vi.fn().mockResolvedValue(true),
    listSessions: vi.fn().mockResolvedValue([]),
    findSession: mockFindSession,
    focusSession: vi.fn().mockResolvedValue(undefined),
    createTab: vi.fn().mockResolvedValue({ name: 'new', windowId: 1, tabId: 1 }),
    writeText: mockWriteText,
    activate: vi.fn().mockResolvedValue(undefined),
  } as unknown as TerminalAdapter & { mockWriteText: ReturnType<typeof vi.fn>; mockFindSession: ReturnType<typeof vi.fn> };
}

function createBridgeConfig(overrides: Partial<AppConfig['slackBridge']> = {}): AppConfig['slackBridge'] {
  return {
    enabled: true,
    targetChannel: '#claude-output',
    forwardStop: true,
    forwardSubagentStop: true,
    forwardTaskComplete: true,
    forwardToolUse: true,
    forwardNeedsInput: true,
    forwardUserPrompt: true,
    threadingMode: 'continuous',
    maxThreadMessages: 50,
    reverseEnabled: false,
    maxMessageLength: 3000,
    ...overrides,
  };
}

function createBridgeEvent(overrides: Partial<ConnectorEvent> = {}): ConnectorEvent {
  return {
    id: `test_${Date.now()}`,
    connectorId: 'claude-code-1',
    timestamp: Date.now(),
    severity: 'info',
    title: 'Claude Code: test-project',
    body: 'This is a test output message',
    category: 'bridge-output',
    eventType: 'output-stop',
    metadata: { sessionId: 'test-project', eventType: 'output-stop' },
    ...overrides,
  };
}

describe('SlackBridgeService', () => {
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(() => {
    engine = createMockEngine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('event filtering', () => {
    it('ignores events when bridge is disabled', () => {
      const config = createBridgeConfig({ enabled: false });
      const bridge = new SlackBridgeService(engine, config);

      const result = bridge.handleEvent(createBridgeEvent());
      expect(result).toBe(false);
      expect(engine.mockSendMessage).not.toHaveBeenCalled();
    });

    it('ignores events from Slack connectors (no loop)', () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      const result = bridge.handleEvent(createBridgeEvent({ connectorId: 'slack-1', eventType: 'message-received' }));
      expect(result).toBe(false);
    });

    it('ignores events without connectorId', () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      const result = bridge.handleEvent(createBridgeEvent({ connectorId: undefined as unknown as string }));
      expect(result).toBe(false);
    });

    it('ignores stop events when forwardStop is false', () => {
      const config = createBridgeConfig({ forwardStop: false });
      const bridge = new SlackBridgeService(engine, config);

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'output-stop' }));
      expect(result).toBe(false);
    });

    it('ignores subagent-stop events when forwardSubagentStop is false', () => {
      const config = createBridgeConfig({ forwardSubagentStop: false });
      const bridge = new SlackBridgeService(engine, config);

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'output-subagent-stop' }));
      expect(result).toBe(false);
    });

    it('ignores task-complete events when forwardTaskComplete is false', () => {
      const config = createBridgeConfig({ forwardTaskComplete: false });
      const bridge = new SlackBridgeService(engine, config);

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'task-complete' }));
      expect(result).toBe(false);
    });

    it('ignores needs-input events when forwardNeedsInput is false', () => {
      const config = createBridgeConfig({ forwardNeedsInput: false });
      const bridge = new SlackBridgeService(engine, config);

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'needs-input' }));
      expect(result).toBe(false);
    });

    it('ignores user-prompt events when forwardUserPrompt is false', () => {
      const config = createBridgeConfig({ forwardUserPrompt: false });
      const bridge = new SlackBridgeService(engine, config);

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'user-prompt' }));
      expect(result).toBe(false);
    });

    it('ignores tool-use events when forwardToolUse is false', () => {
      const config = createBridgeConfig({ forwardToolUse: false });
      const bridge = new SlackBridgeService(engine, config);

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'output-tool-use' }));
      expect(result).toBe(false);
    });

    it('forwards output-stop events', () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'output-stop' }));
      expect(result).toBe(true);
    });

    it('forwards output-subagent-stop events', () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'output-subagent-stop' }));
      expect(result).toBe(true);
    });

    it('forwards output-tool-use events', () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'output-tool-use' }));
      expect(result).toBe(true);
    });

    it('forwards needs-input events', () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'needs-input' }));
      expect(result).toBe(true);
    });

    it('forwards task-complete events', () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'task-complete' }));
      expect(result).toBe(true);
    });

    it('forwards any claude-code event type', () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      const result = bridge.handleEvent(createBridgeEvent({ eventType: 'some-custom-event' }));
      expect(result).toBe(true);
    });

    it('returns false when no target channel configured', () => {
      const config = createBridgeConfig({ targetChannel: '' });
      const bridge = new SlackBridgeService(engine, config);

      const result = bridge.handleEvent(createBridgeEvent());
      expect(result).toBe(false);
    });
  });

  describe('thread mapping', () => {
    it('creates a new thread for a new session', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent());

      // Wait for async sendToSlack
      await vi.advanceTimersByTimeAsync(0);

      expect(engine.mockSendMessage).toHaveBeenCalledTimes(1);
      const sentText = engine.mockSendMessage.mock.calls[0][1] as string;
      expect(sentText).toContain('*Session:* `test-project`');
      // First message has no threadTs (creates a new thread)
      expect(engine.mockSendMessage.mock.calls[0][2]).toBeUndefined();
      // Bridge messages use orange color
      expect(engine.mockSendMessage.mock.calls[0][3]).toBe('#f97316');
    });

    it('replies in thread for subsequent messages in same session', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      // First message creates thread
      bridge.handleEvent(createBridgeEvent({ body: 'First message' }));
      await vi.advanceTimersByTimeAsync(0);

      expect(engine.mockSendMessage).toHaveBeenCalledTimes(1);

      // Second message should reply in thread
      bridge.handleEvent(createBridgeEvent({ body: 'Second message' }));
      await vi.advanceTimersByTimeAsync(0);

      expect(engine.mockSendMessage).toHaveBeenCalledTimes(2);
      expect(engine.mockSendMessage).toHaveBeenLastCalledWith(
        '#claude-output',
        expect.not.stringContaining('*Session:*'),
        '1234567890.123456',
        '#f97316',
      );
    });

    it('tracks thread mappings per session', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent({ metadata: { sessionId: 'project-a', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      const threads = bridge.getSessionThreads();
      expect(threads.has('project-a')).toBe(true);
      expect(threads.get('project-a')?.threadTs).toBe('1234567890.123456');
    });
  });

  describe('rate limiting / batching', () => {
    it('debounces tool-use events', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      // Fire multiple tool-use events rapidly
      bridge.handleEvent(createBridgeEvent({
        eventType: 'output-tool-use',
        body: 'Tool 1',
        metadata: { sessionId: 'proj', eventType: 'output-tool-use', toolName: 'Write' },
      }));
      bridge.handleEvent(createBridgeEvent({
        eventType: 'output-tool-use',
        body: 'Tool 2',
        metadata: { sessionId: 'proj', eventType: 'output-tool-use', toolName: 'Edit' },
      }));

      // Nothing sent yet
      expect(engine.mockSendMessage).not.toHaveBeenCalled();

      // After debounce period, batch is flushed
      await vi.advanceTimersByTimeAsync(2100);

      expect(engine.mockSendMessage).toHaveBeenCalledTimes(1);
      // Should contain both tool messages combined
      const sentText = engine.mockSendMessage.mock.calls[0][1] as string;
      expect(sentText).toContain('Write');
      expect(sentText).toContain('Edit');
    });

    it('sends stop messages immediately (no debounce)', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent({ eventType: 'output-stop' }));

      // Should send immediately
      await vi.advanceTimersByTimeAsync(0);

      expect(engine.mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('message formatting', () => {
    it('truncates messages that exceed maxMessageLength', async () => {
      const config = createBridgeConfig({ maxMessageLength: 100 });
      const bridge = new SlackBridgeService(engine, config);

      const longBody = 'x'.repeat(200);
      bridge.handleEvent(createBridgeEvent({ body: longBody }));
      await vi.advanceTimersByTimeAsync(0);

      const sentText = engine.mockSendMessage.mock.calls[0][1] as string;
      expect(sentText.length).toBeLessThanOrEqual(150); // accounts for session header
      expect(sentText).toContain('... (truncated)');
    });

    it('formats subagent-stop messages with header', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent({
        eventType: 'output-subagent-stop',
        body: 'Subagent done',
        metadata: { sessionId: 'proj', eventType: 'output-subagent-stop' },
      }));
      await vi.advanceTimersByTimeAsync(0);

      const sentText = engine.mockSendMessage.mock.calls[0][1] as string;
      expect(sentText).toContain('*Subagent finished:*');
    });

    it('formats tool-use messages with tool name', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent({
        eventType: 'output-tool-use',
        body: 'File written',
        metadata: { sessionId: 'proj', eventType: 'output-tool-use', toolName: 'Write' },
      }));
      await vi.advanceTimersByTimeAsync(2100);

      const sentText = engine.mockSendMessage.mock.calls[0][1] as string;
      expect(sentText).toContain('[Write]');
    });

    it('formats needs-input with bell emoji', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent({
        eventType: 'needs-input',
        body: 'Waiting for your input',
        metadata: { sessionId: 'proj', eventType: 'needs-input' },
      }));
      await vi.advanceTimersByTimeAsync(0);

      const sentText = engine.mockSendMessage.mock.calls[0][1] as string;
      expect(sentText).toContain(':bell:');
      expect(sentText).toContain('Waiting for input');
    });

    it('formats task-complete with checkmark', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent({
        eventType: 'task-complete',
        body: '',
        metadata: { sessionId: 'proj', eventType: 'task-complete' },
      }));
      await vi.advanceTimersByTimeAsync(0);

      const sentText = engine.mockSendMessage.mock.calls[0][1] as string;
      expect(sentText).toContain(':white_check_mark:');
      expect(sentText).toContain('Task completed');
    });
  });

  describe('error handling', () => {
    it('handles missing Slack connector gracefully', async () => {
      const noSlackEngine = createMockEngine(false);
      const bridge = new SlackBridgeService(noSlackEngine, createBridgeConfig());

      const result = bridge.handleEvent(createBridgeEvent());
      expect(result).toBe(true); // Event was recognized as bridge event

      await vi.advanceTimersByTimeAsync(0);
      // Should not throw
    });

    it('handles sendMessage failure gracefully', async () => {
      engine.mockSendMessage.mockResolvedValueOnce({ ok: false, error: 'channel_not_found' });
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent());
      await vi.advanceTimersByTimeAsync(0);

      // Should not throw, thread should not be created
      const threads = bridge.getSessionThreads();
      expect(threads.size).toBe(0);
    });
  });

  describe('config updates', () => {
    it('updateConfig changes behavior', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      // Disable the bridge
      bridge.updateConfig(createBridgeConfig({ enabled: false }));

      const result = bridge.handleEvent(createBridgeEvent());
      expect(result).toBe(false);
    });
  });

  describe('reverse bridge (Slack → terminal)', () => {
    function createSlackEvent(overrides: Partial<ConnectorEvent> = {}): ConnectorEvent {
      return {
        id: `slack_${Date.now()}`,
        connectorId: 'slack-1',
        timestamp: Date.now(),
        severity: 'info',
        title: 'Slack: #claude-output',
        body: 'Hello from Slack',
        category: 'notification',
        eventType: 'message-received',
        metadata: {
          channel: 'claude-output',
          channelId: 'C123',
          user: 'Jane',
          userId: 'U999',
          ts: '9999.000',
          threadTs: '1234567890.123456',
        },
        ...overrides,
      };
    }

    it('routes Slack thread reply to terminal session', async () => {
      const terminal = createMockTerminal();
      const config = createBridgeConfig({ reverseEnabled: true });
      const bridge = new SlackBridgeService(engine, config, terminal);

      // First: create a bridge thread by sending outbound
      bridge.handleEvent(createBridgeEvent({ metadata: { sessionId: 'test-project', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      // Verify thread was created and reverse map populated
      const reverseMap = bridge.getThreadToSession();
      expect(reverseMap.get('1234567890.123456')).toBe('test-project');

      // Now simulate an inbound Slack reply in that thread
      const result = bridge.handleInboundEvent(createSlackEvent());
      expect(result).toBe(true);

      await vi.advanceTimersByTimeAsync(0);

      expect(terminal.mockFindSession).toHaveBeenCalledWith('test-project');
      expect(terminal.mockWriteText).toHaveBeenCalledWith(
        { name: 'test-project', windowId: 1, tabId: 1 },
        'Hello from Slack',
      );
    });

    it('ignores inbound events when reverse is disabled', async () => {
      const terminal = createMockTerminal();
      const config = createBridgeConfig({ reverseEnabled: false });
      const bridge = new SlackBridgeService(engine, config, terminal);

      // Create thread
      bridge.handleEvent(createBridgeEvent());
      await vi.advanceTimersByTimeAsync(0);

      const result = bridge.handleInboundEvent(createSlackEvent());
      expect(result).toBe(false);
      expect(terminal.mockWriteText).not.toHaveBeenCalled();
    });

    it('ignores inbound events without terminal adapter', async () => {
      const config = createBridgeConfig({ reverseEnabled: true });
      const bridge = new SlackBridgeService(engine, config, null);

      bridge.handleEvent(createBridgeEvent());
      await vi.advanceTimersByTimeAsync(0);

      const result = bridge.handleInboundEvent(createSlackEvent());
      expect(result).toBe(false);
    });

    it('ignores inbound events from wrong channel', async () => {
      const terminal = createMockTerminal();
      const config = createBridgeConfig({ reverseEnabled: true });
      const bridge = new SlackBridgeService(engine, config, terminal);

      bridge.handleEvent(createBridgeEvent());
      await vi.advanceTimersByTimeAsync(0);

      const result = bridge.handleInboundEvent(createSlackEvent({
        metadata: { channel: 'other-channel', channelId: 'C999', threadTs: '1234567890.123456', userId: 'U999' },
      }));
      expect(result).toBe(false);
    });

    it('ignores inbound events without threadTs', async () => {
      const terminal = createMockTerminal();
      const config = createBridgeConfig({ reverseEnabled: true });
      const bridge = new SlackBridgeService(engine, config, terminal);

      bridge.handleEvent(createBridgeEvent());
      await vi.advanceTimersByTimeAsync(0);

      const result = bridge.handleInboundEvent(createSlackEvent({
        metadata: { channel: 'claude-output', channelId: 'C123', userId: 'U999' },
      }));
      expect(result).toBe(false);
    });

    it('ignores inbound events for unknown threads', async () => {
      const terminal = createMockTerminal();
      const config = createBridgeConfig({ reverseEnabled: true });
      const bridge = new SlackBridgeService(engine, config, terminal);

      // No outbound thread created
      const result = bridge.handleInboundEvent(createSlackEvent({
        metadata: { channel: 'claude-output', channelId: 'C123', threadTs: 'unknown-thread', userId: 'U999' },
      }));
      expect(result).toBe(false);
    });

    it('ignores bot own messages', async () => {
      const terminal = createMockTerminal();
      const config = createBridgeConfig({ reverseEnabled: true });
      const bridge = new SlackBridgeService(engine, config, terminal);
      bridge.setBotUserId('U_BOT');

      bridge.handleEvent(createBridgeEvent());
      await vi.advanceTimersByTimeAsync(0);

      const result = bridge.handleInboundEvent(createSlackEvent({
        metadata: {
          channel: 'claude-output', channelId: 'C123',
          threadTs: '1234567890.123456', userId: 'U_BOT',
        },
      }));
      expect(result).toBe(false);
    });

    it('ignores empty messages', async () => {
      const terminal = createMockTerminal();
      const config = createBridgeConfig({ reverseEnabled: true });
      const bridge = new SlackBridgeService(engine, config, terminal);

      bridge.handleEvent(createBridgeEvent());
      await vi.advanceTimersByTimeAsync(0);

      const result = bridge.handleInboundEvent(createSlackEvent({ body: '  ' }));
      expect(result).toBe(false);
    });

    it('handles terminal session not found', async () => {
      const terminal = createMockTerminal();
      terminal.mockFindSession.mockResolvedValue(null);
      const config = createBridgeConfig({ reverseEnabled: true });
      const bridge = new SlackBridgeService(engine, config, terminal);

      bridge.handleEvent(createBridgeEvent());
      await vi.advanceTimersByTimeAsync(0);

      // Should not throw
      const result = bridge.handleInboundEvent(createSlackEvent());
      expect(result).toBe(true); // Event was recognized
      await vi.advanceTimersByTimeAsync(0);

      expect(terminal.mockFindSession).toHaveBeenCalled();
      expect(terminal.mockWriteText).not.toHaveBeenCalled();
    });

    it('handles non-message event types', async () => {
      const terminal = createMockTerminal();
      const config = createBridgeConfig({ reverseEnabled: true });
      const bridge = new SlackBridgeService(engine, config, terminal);

      const result = bridge.handleInboundEvent(createSlackEvent({ eventType: 'dm-received' }));
      expect(result).toBe(false);
    });
  });

  describe('threading modes', () => {
    it('continuous: all messages stay in same thread', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig({ threadingMode: 'continuous' }));

      // First message creates thread
      bridge.handleEvent(createBridgeEvent({ body: 'First', metadata: { sessionId: 'proj', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      // Second message (user-prompt) stays in same thread in continuous mode
      bridge.handleEvent(createBridgeEvent({ eventType: 'user-prompt', body: 'My prompt', metadata: { sessionId: 'proj', eventType: 'user-prompt' } }));
      await vi.advanceTimersByTimeAsync(0);

      expect(engine.mockSendMessage).toHaveBeenCalledTimes(2);
      // Second call should be a thread reply (has threadTs)
      expect(engine.mockSendMessage.mock.calls[1][2]).toBe('1234567890.123456');
    });

    it('per-interaction: user-prompt starts new main message', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig({ threadingMode: 'per-interaction' }));

      // First message creates thread
      bridge.handleEvent(createBridgeEvent({ body: 'First', metadata: { sessionId: 'proj', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      // user-prompt should start a new thread in per-interaction mode
      bridge.handleEvent(createBridgeEvent({ eventType: 'user-prompt', body: 'My prompt', metadata: { sessionId: 'proj', eventType: 'user-prompt' } }));
      await vi.advanceTimersByTimeAsync(0);

      expect(engine.mockSendMessage).toHaveBeenCalledTimes(2);
      // Second call should be a new main message (no threadTs)
      expect(engine.mockSendMessage.mock.calls[1][2]).toBeUndefined();
      // Should include session header
      const sentText = engine.mockSendMessage.mock.calls[1][1] as string;
      expect(sentText).toContain('*Session:*');
    });

    it('per-interaction: needs-input starts new main message', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig({ threadingMode: 'per-interaction' }));

      bridge.handleEvent(createBridgeEvent({ body: 'First', metadata: { sessionId: 'proj', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      bridge.handleEvent(createBridgeEvent({ eventType: 'needs-input', body: '', metadata: { sessionId: 'proj', eventType: 'needs-input' } }));
      await vi.advanceTimersByTimeAsync(0);

      expect(engine.mockSendMessage).toHaveBeenCalledTimes(2);
      expect(engine.mockSendMessage.mock.calls[1][2]).toBeUndefined();
    });

    it('maxThreadMessages: overflow starts new thread', async () => {
      const config = createBridgeConfig({ maxThreadMessages: 2 });
      const bridge = new SlackBridgeService(engine, config);

      // Message 1 creates thread (messageCount = 1)
      bridge.handleEvent(createBridgeEvent({ body: 'Msg 1', metadata: { sessionId: 'proj', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      // Message 2 replies in thread (messageCount = 2)
      bridge.handleEvent(createBridgeEvent({ body: 'Msg 2', metadata: { sessionId: 'proj', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      // Message 3 should start a new thread (messageCount >= maxThreadMessages)
      bridge.handleEvent(createBridgeEvent({ body: 'Msg 3', metadata: { sessionId: 'proj', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      expect(engine.mockSendMessage).toHaveBeenCalledTimes(3);
      // Third call should be a new main message
      expect(engine.mockSendMessage.mock.calls[2][2]).toBeUndefined();
      const sentText = engine.mockSendMessage.mock.calls[2][1] as string;
      expect(sentText).toContain('*Session:*');
    });

    it('tracks messageCount correctly', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent({ body: 'First', metadata: { sessionId: 'proj', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      bridge.handleEvent(createBridgeEvent({ body: 'Second', metadata: { sessionId: 'proj', eventType: 'output-stop' } }));
      await vi.advanceTimersByTimeAsync(0);

      const threads = bridge.getSessionThreads();
      expect(threads.get('proj')?.messageCount).toBe(2);
    });
  });

  describe('user-prompt formatting', () => {
    it('formats user-prompt with speech balloon emoji', async () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent({
        eventType: 'user-prompt',
        body: 'Implement the new feature',
        metadata: { sessionId: 'proj', eventType: 'user-prompt' },
      }));
      await vi.advanceTimersByTimeAsync(0);

      const sentText = engine.mockSendMessage.mock.calls[0][1] as string;
      expect(sentText).toContain(':speech_balloon:');
      expect(sentText).toContain('*User prompt:*');
      expect(sentText).toContain('Implement the new feature');
    });
  });

  describe('destroy', () => {
    it('clears pending batch timers on destroy', () => {
      const bridge = new SlackBridgeService(engine, createBridgeConfig());

      bridge.handleEvent(createBridgeEvent({
        eventType: 'output-tool-use',
        metadata: { sessionId: 'proj', eventType: 'output-tool-use', toolName: 'Write' },
      }));

      // Destroy before batch timer fires
      bridge.destroy();

      // Advancing time should not cause any sends
      vi.advanceTimersByTime(5000);
      expect(engine.mockSendMessage).not.toHaveBeenCalled();
    });
  });
});
