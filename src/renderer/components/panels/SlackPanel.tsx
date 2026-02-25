// ============================================================
// SlackPanel - Slack conversation view with send/receive/reply
// ============================================================

import { useState, useRef, useEffect, useMemo } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import { connectorEventToSlackMessage } from '@renderer/hooks/useIPCSync';
import { Modal } from '@renderer/components/common/Modal';
import type { SlackChatMessage } from '@shared/types';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- Channel Selector ---

function ChannelSelector({
  channels,
  selected,
  onSelect,
  onRefresh,
  refreshing,
  bridgeChannel,
}: {
  channels: string[];
  selected: string | null;
  onSelect: (ch: string | null) => void;
  onRefresh: () => void;
  refreshing: boolean;
  bridgeChannel: string | null;
}) {
  const isBridge = (ch: string) => bridgeChannel === ch;

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-800/50">
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto">
        <button
          onClick={() => onSelect(null)}
          className={`
            px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors
            ${selected === null
              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
              : 'bg-gray-800/40 text-gray-400 border border-gray-700/40 hover:text-gray-300'
            }
          `}
        >
          All
        </button>
        {channels.map(ch => {
          const bridge = isBridge(ch);
          const active = selected === ch;
          const cls = active
            ? bridge
              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
            : bridge
              ? 'bg-orange-900/30 text-orange-400 border border-orange-700/40 hover:text-orange-300'
              : 'bg-gray-800/40 text-gray-400 border border-gray-700/40 hover:text-gray-300';
          return (
            <button
              key={ch}
              onClick={() => onSelect(ch)}
              className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${cls}`}
            >
              #{ch}
            </button>
          );
        })}
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        title="Refresh channels & messages"
        className="flex-shrink-0 px-2 py-1 rounded text-xs transition-colors text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className={`inline-block ${refreshing ? 'animate-spin' : ''}`} style={{ transformOrigin: 'center' }}>&#8635;</span>
      </button>
    </div>
  );
}

// --- Message Bubble ---

/** Find the parent message text for a thread reply (for "replying to" preview) */
function findParentPreview(message: SlackChatMessage, allMessages: SlackChatMessage[]): string | null {
  if (!message.threadTs || message.threadTs === message.slackTs) return null;
  const parent = allMessages.find(m => m.slackTs === message.threadTs);
  if (!parent) return null;
  const preview = parent.text.slice(0, 60);
  return preview.length < parent.text.length ? preview + '...' : preview;
}

function MessageBubble({
  message,
  parentPreview,
  onClick,
  onRetry,
  isBridgeChannel,
}: {
  message: SlackChatMessage;
  parentPreview: string | null;
  onClick: () => void;
  onRetry: () => void;
  isBridgeChannel: boolean;
}) {
  const isSent = message.direction === 'sent';
  const isFailed = message.status === 'failed';
  const isSending = message.status === 'sending';
  const isReply = !!parentPreview;

  const borderColor = isFailed
    ? 'border-red-500/60'
    : isBridgeChannel
      ? 'border-orange-500/50'
      : isSent
        ? 'border-indigo-500/50'
        : 'border-[#611f69]/60';

  const bgColor = isBridgeChannel
    ? 'bg-orange-950/30 hover:bg-orange-950/50'
    : 'bg-gray-800/40 hover:bg-gray-800/60';

  const borderSide = isSent ? 'border-r-2' : 'border-l-2';

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-2`}>
      <button
        onClick={onClick}
        className={`
          max-w-[80%] rounded-lg px-3 py-2 text-left transition-colors
          ${bgColor}
          ${borderSide} ${borderColor}
          ${isSending ? 'opacity-50' : ''}
        `}
      >
        {isReply && (
          <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-gray-700/30">
            <span className="text-[9px] text-gray-600">↩</span>
            <span className="text-[9px] text-gray-500 italic truncate">{parentPreview}</span>
          </div>
        )}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-medium text-gray-400">
            {isSent ? 'You' : message.user || 'Unknown'}
          </span>
          {message.eventType && !isSent && (
            <span className="text-[9px] text-gray-600">{message.eventType}</span>
          )}
          <span className="text-[10px] text-gray-600 ml-auto">
            {isSending ? 'Sending...' : formatTime(message.timestamp)}
          </span>
        </div>
        <div className="text-xs text-gray-300 break-words whitespace-pre-wrap">
          {message.text}
        </div>
        {isFailed && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] text-red-400 truncate">
              {message.error || 'Send failed'}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(); }}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 underline"
            >
              Retry
            </button>
          </div>
        )}
      </button>
    </div>
  );
}

// --- Message Detail Modal ---

function MessageDetail({
  message,
  onClose,
  onReplyInThread,
}: {
  message: SlackChatMessage;
  onClose: () => void;
  onReplyInThread: (threadTs: string) => void;
}) {
  return (
    <Modal title="Message Detail" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <span className="text-[10px] text-gray-500 uppercase">Direction</span>
          <p className="text-xs text-gray-300">{message.direction}</p>
        </div>
        <div>
          <span className="text-[10px] text-gray-500 uppercase">Channel</span>
          <p className="text-xs text-gray-300">#{message.channel}</p>
        </div>
        {message.user && (
          <div>
            <span className="text-[10px] text-gray-500 uppercase">User</span>
            <p className="text-xs text-gray-300">{message.user}</p>
          </div>
        )}
        <div>
          <span className="text-[10px] text-gray-500 uppercase">Time</span>
          <p className="text-xs text-gray-300">{new Date(message.timestamp).toLocaleString()}</p>
        </div>
        {message.eventType && (
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Event Type</span>
            <p className="text-xs text-gray-300">{message.eventType}</p>
          </div>
        )}
        {message.slackTs && (
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Slack TS</span>
            <p className="text-xs text-gray-300 font-mono">{message.slackTs}</p>
          </div>
        )}
        {message.threadTs && (
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Thread TS</span>
            <p className="text-xs text-gray-300 font-mono">{message.threadTs}</p>
          </div>
        )}
        {message.status && (
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Status</span>
            <p className="text-xs text-gray-300">{message.status}</p>
          </div>
        )}
        {message.error && (
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Error</span>
            <p className="text-xs text-red-400">{message.error}</p>
          </div>
        )}
        <div>
          <span className="text-[10px] text-gray-500 uppercase">Text</span>
          <p className="text-xs text-gray-300 whitespace-pre-wrap mt-1">{message.text}</p>
        </div>
        {message.direction === 'received' && (
          <button
            onClick={() => onReplyInThread(message.slackTs || message.threadTs || '')}
            className="mt-2 px-3 py-1.5 bg-indigo-600/20 text-indigo-300 rounded text-xs hover:bg-indigo-600/30 transition-colors"
          >
            Reply in Thread
          </button>
        )}
      </div>
    </Modal>
  );
}

// --- Reply Input ---

function ReplyInput({
  channel,
  threadTs,
  onClearThread,
  onSend,
  disabled,
}: {
  channel: string | null;
  threadTs: string | null;
  onClearThread: () => void;
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    // Reset height after clearing
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize: reset then grow to scrollHeight, capped at 5 lines
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  };

  return (
    <div className="border-t border-gray-800/50 px-3 py-2">
      {threadTs && (
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] text-gray-500">Replying to thread</span>
          <button
            onClick={onClearThread}
            className="text-[10px] text-gray-500 hover:text-gray-300"
          >
            &times;
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={channel ? `Message #${channel}...` : 'Select a channel...'}
          disabled={disabled}
          className="flex-1 bg-gray-800/40 border border-gray-700/40 rounded px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 disabled:opacity-40 resize-none overflow-hidden"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="px-3 py-1.5 bg-indigo-600/20 text-indigo-300 rounded text-xs hover:bg-indigo-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// --- Main Panel ---

export function SlackPanel() {
  const slackMessages = useDashboardStore(s => s.slackMessages);
  const slackChannels = useDashboardStore(s => s.slackChannels);
  const selectedChannel = useDashboardStore(s => s.selectedSlackChannel);
  const setSelectedChannel = useDashboardStore(s => s.setSelectedSlackChannel);
  const addSlackMessage = useDashboardStore(s => s.addSlackMessage);
  const updateSlackMessage = useDashboardStore(s => s.updateSlackMessage);
  const config = useDashboardStore(s => s.config);

  const setSlackChannels = useDashboardStore(s => s.setSlackChannels);
  const setEvents = useDashboardStore(s => s.setEvents);

  // Normalize bridge target channel for comparison (strip leading #)
  const bridgeChannel = config?.slackBridge?.targetChannel?.replace(/^#/, '') || null;

  const [detailMessage, setDetailMessage] = useState<SlackChatMessage | null>(null);
  const [threadTs, setThreadTs] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Build unique channel list from both configured channels and message history
  const allChannels = useMemo(() => {
    const set = new Set<string>();
    for (const ch of slackChannels) set.add(ch.replace(/^#/, ''));
    for (const msg of slackMessages) set.add(msg.channel.replace(/^#/, ''));
    set.delete('unknown');
    return [...set].sort();
  }, [slackChannels, slackMessages]);

  // Filter messages by selected channel
  const filteredMessages = useMemo(() => {
    if (!selectedChannel) return [...slackMessages].sort((a, b) => a.timestamp - b.timestamp);
    const norm = selectedChannel.replace(/^#/, '');
    return slackMessages
      .filter(m => m.channel.replace(/^#/, '') === norm)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [slackMessages, selectedChannel]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [filteredMessages.length]);

  const connectors = useDashboardStore(s => s.connectors);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const api = window.iDashboard;
      if (!api) return;

      // Find the Slack connector ID and force-poll it against the Slack API
      const slackConnector = connectors.find(c => c.type === 'slack');
      if (slackConnector) {
        console.log('[SlackPanel] Force polling connector:', slackConnector.id);
        const result = await api.forcePollConnector?.(slackConnector.id);
        console.log('[SlackPanel] Force poll result:', result);
      } else {
        console.warn('[SlackPanel] No Slack connector found in:', connectors.map(c => ({ id: c.id, type: c.type })));
      }

      // Now re-read channels and all stored events (including freshly polled ones)
      const [channels, events] = await Promise.all([
        api.slackGetChannels?.() ?? [],
        api.getEvents(),
      ]);
      console.log('[SlackPanel] Refreshed:', channels.length, 'channels,', events.length, 'events');
      setSlackChannels(channels);
      setEvents(events);

      // Re-mirror Slack events into conversation store
      let mirrored = 0;
      for (const evt of events) {
        const msg = connectorEventToSlackMessage(evt);
        if (msg) {
          addSlackMessage(msg);
          mirrored++;
        }
      }
      console.log('[SlackPanel] Mirrored', mirrored, 'Slack events into chat store');
    } catch (err) {
      console.error('[SlackPanel] Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const sendChannel = selectedChannel?.replace(/^#/, '') || null;

  const handleSend = async (text: string) => {
    if (!sendChannel) return;

    const id = `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message: SlackChatMessage = {
      id,
      channel: sendChannel,
      text,
      timestamp: Date.now(),
      direction: 'sent',
      threadTs: threadTs || undefined,
      status: 'sending',
    };

    addSlackMessage(message);
    setThreadTs(null);

    try {
      const result = await window.iDashboard?.slackSend(sendChannel, text, threadTs || undefined);
      if (result?.ok) {
        updateSlackMessage(id, { status: 'sent', slackTs: result.ts });
      } else {
        updateSlackMessage(id, { status: 'failed', error: result?.error || 'Unknown error' });
      }
    } catch (err) {
      updateSlackMessage(id, { status: 'failed', error: String(err) });
    }
  };

  const handleRetry = async (msg: SlackChatMessage) => {
    updateSlackMessage(msg.id, { status: 'sending', error: undefined });
    try {
      const result = await window.iDashboard?.slackSend(
        msg.channel, msg.text, msg.threadTs
      );
      if (result?.ok) {
        updateSlackMessage(msg.id, { status: 'sent', slackTs: result.ts });
      } else {
        updateSlackMessage(msg.id, { status: 'failed', error: result?.error || 'Unknown error' });
      }
    } catch (err) {
      updateSlackMessage(msg.id, { status: 'failed', error: String(err) });
    }
  };

  const handleReplyInThread = (ts: string) => {
    if (ts) {
      setThreadTs(ts);
      setDetailMessage(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <ChannelSelector
        channels={allChannels}
        selected={selectedChannel}
        onSelect={setSelectedChannel}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        bridgeChannel={bridgeChannel}
      />

      <div
        ref={feedRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2"
      >
        {filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            {slackMessages.length === 0
              ? 'No Slack messages yet. Messages will appear here as they arrive.'
              : 'No messages in this channel.'}
          </div>
        ) : (
          filteredMessages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              parentPreview={findParentPreview(msg, filteredMessages)}
              onClick={() => setDetailMessage(msg)}
              onRetry={() => handleRetry(msg)}
              isBridgeChannel={bridgeChannel !== null && msg.channel.replace(/^#/, '') === bridgeChannel}
            />
          ))
        )}
      </div>

      <ReplyInput
        channel={sendChannel}
        threadTs={threadTs}
        onClearThread={() => setThreadTs(null)}
        onSend={handleSend}
        disabled={!sendChannel}
      />

      {detailMessage && (
        <MessageDetail
          message={detailMessage}
          onClose={() => setDetailMessage(null)}
          onReplyInThread={handleReplyInThread}
        />
      )}
    </div>
  );
}
