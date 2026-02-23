// ============================================================
// Slack Messages Store Tests
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The dashboard store accesses window.innerWidth/Height at module load.
// Provide a minimal global before importing the store.
vi.stubGlobal('window', {
  innerWidth: 800,
  innerHeight: 600,
  iDashboard: undefined,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Must import after window stub
const { useDashboardStore } = await import('@renderer/store/dashboard');
import type { SlackChatMessage } from '@shared/types';

function makeMessage(overrides: Partial<SlackChatMessage> = {}): SlackChatMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    channel: 'general',
    text: 'Hello',
    timestamp: Date.now(),
    direction: 'received',
    ...overrides,
  };
}

// zustand stores are singletons — reset between tests
beforeEach(() => {
  useDashboardStore.setState({
    slackMessages: [],
    selectedSlackChannel: null,
  });
});

describe('addSlackMessage', () => {
  it('adds a message to the store', () => {
    const msg = makeMessage({ id: 'test-1' });
    useDashboardStore.getState().addSlackMessage(msg);

    const messages = useDashboardStore.getState().slackMessages;
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('test-1');
  });

  it('deduplicates by id', () => {
    const msg = makeMessage({ id: 'dup-1' });
    const { addSlackMessage } = useDashboardStore.getState();

    addSlackMessage(msg);
    addSlackMessage(msg);
    addSlackMessage({ ...msg, text: 'different text' });

    expect(useDashboardStore.getState().slackMessages).toHaveLength(1);
  });

  it('caps at 500 messages', () => {
    const { addSlackMessage } = useDashboardStore.getState();

    for (let i = 0; i < 510; i++) {
      addSlackMessage(makeMessage({ id: `cap-${i}` }));
    }

    const messages = useDashboardStore.getState().slackMessages;
    expect(messages).toHaveLength(500);
    // Should keep the latest 500 (slice(-500))
    expect(messages[0].id).toBe('cap-10');
    expect(messages[499].id).toBe('cap-509');
  });

  it('preserves message order', () => {
    const { addSlackMessage } = useDashboardStore.getState();

    addSlackMessage(makeMessage({ id: 'a', timestamp: 100 }));
    addSlackMessage(makeMessage({ id: 'b', timestamp: 200 }));
    addSlackMessage(makeMessage({ id: 'c', timestamp: 150 }));

    const ids = useDashboardStore.getState().slackMessages.map(m => m.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('updateSlackMessage', () => {
  it('updates status and error fields', () => {
    const msg = makeMessage({ id: 'upd-1', status: 'sending' });
    useDashboardStore.getState().addSlackMessage(msg);
    useDashboardStore.getState().updateSlackMessage('upd-1', {
      status: 'failed',
      error: 'channel_not_found',
    });

    const updated = useDashboardStore.getState().slackMessages[0];
    expect(updated.status).toBe('failed');
    expect(updated.error).toBe('channel_not_found');
    expect(updated.text).toBe('Hello'); // unchanged fields preserved
  });

  it('does not affect other messages', () => {
    const { addSlackMessage, updateSlackMessage } = useDashboardStore.getState();
    addSlackMessage(makeMessage({ id: 'x1', text: 'first' }));
    addSlackMessage(makeMessage({ id: 'x2', text: 'second' }));

    updateSlackMessage('x1', { status: 'sent' });

    const messages = useDashboardStore.getState().slackMessages;
    expect(messages[0].status).toBe('sent');
    expect(messages[1].status).toBeUndefined();
  });

  it('no-ops for unknown id', () => {
    useDashboardStore.getState().addSlackMessage(makeMessage({ id: 'known' }));
    useDashboardStore.getState().updateSlackMessage('unknown-id', { status: 'sent' });

    expect(useDashboardStore.getState().slackMessages).toHaveLength(1);
    expect(useDashboardStore.getState().slackMessages[0].id).toBe('known');
  });
});

describe('setSelectedSlackChannel', () => {
  it('sets the selected channel', () => {
    useDashboardStore.getState().setSelectedSlackChannel('dev');
    expect(useDashboardStore.getState().selectedSlackChannel).toBe('dev');
  });

  it('clears the selected channel with null', () => {
    useDashboardStore.getState().setSelectedSlackChannel('dev');
    useDashboardStore.getState().setSelectedSlackChannel(null);
    expect(useDashboardStore.getState().selectedSlackChannel).toBeNull();
  });
});

describe('received event mirroring shape', () => {
  it('creates correct SlackChatMessage from received direction', () => {
    const msg: SlackChatMessage = {
      id: 'recv-evt-1',
      channel: 'general',
      text: 'Hey there',
      timestamp: 1700000000000,
      direction: 'received',
      user: 'U123',
      eventType: 'dm-received',
      slackTs: '1700000000.000100',
    };

    useDashboardStore.getState().addSlackMessage(msg);
    const stored = useDashboardStore.getState().slackMessages[0];

    expect(stored.direction).toBe('received');
    expect(stored.channel).toBe('general');
    expect(stored.user).toBe('U123');
    expect(stored.eventType).toBe('dm-received');
    expect(stored.slackTs).toBe('1700000000.000100');
    expect(stored.status).toBeUndefined(); // received messages have no send status
  });
});
