// ============================================================
// MinimalDashboard - Compact event ticker view
// Shows recent events with source filter only
// ============================================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import { useBlinkState } from '@renderer/hooks/useBlinkAnimation';
import type { ConnectorEvent } from '@shared/types';

export function MinimalDashboard() {
  const activeEvents = useDashboardStore(s => s.activeEvents);
  const connectors = useDashboardStore(s => s.connectors);
  const dismissEvent = useDashboardStore(s => s.dismissEvent);

  const [selectedConnectors, setSelectedConnectors] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Build connector list
  const connectorList = useMemo(() => {
    const ids = new Set<string>();
    for (const c of connectors) ids.add(c.id);
    for (const e of activeEvents) ids.add(e.connectorId);
    return [...ids].map(id => {
      const c = connectors.find(x => x.id === id);
      return { value: id, label: c?.displayName ?? id };
    });
  }, [connectors, activeEvents]);

  const allSelected = selectedConnectors.size === 0;

  const toggleConnector = useCallback((id: string) => {
    setSelectedConnectors(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (connectorList.length > 0 && next.size === connectorList.length) return new Set();
      return next;
    });
  }, [connectorList.length]);

  const selectAll = useCallback(() => setSelectedConnectors(new Set()), []);

  // Filter by connector
  const displayEvents = useMemo(() => {
    return activeEvents.filter(e =>
      allSelected || selectedConnectors.has(e.connectorId),
    );
  }, [activeEvents, selectedConnectors, allSelected]);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [displayEvents.length]);

  const chipBase = 'px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors select-none';
  const chipOn = 'bg-gray-700 text-gray-200';
  const chipOff = 'bg-transparent text-gray-500 hover:text-gray-400';

  const handleAction = (connectorId: string, actionId: string, params?: unknown) => {
    window.iDashboard?.executeAction(connectorId, actionId, params);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Source filter */}
      {connectorList.length > 1 && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 flex-shrink-0 flex-wrap">
          <span className="text-[10px] text-gray-600 mr-0.5">Source:</span>
          <button className={`${chipBase} ${allSelected ? chipOn : chipOff}`} onClick={selectAll}>
            All
          </button>
          {connectorList.map(c => (
            <button
              key={c.value}
              className={`${chipBase} ${!allSelected && selectedConnectors.has(c.value) ? chipOn : allSelected ? chipOn : chipOff}`}
              onClick={() => toggleConnector(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Event list */}
      {displayEvents.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-gray-600 text-xs">
          No recent events
        </div>
      ) : (
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-1.5 flex flex-col gap-1.5">
          {displayEvents.map((event, i) => (
            <MinimalEventCard
              key={event.id}
              event={event}
              isLatest={i === 0}
              connectorName={connectors.find(c => c.id === event.connectorId)?.displayName ?? event.connectorId}
              onDismiss={dismissEvent}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {/* Connector status bar */}
      {connectors.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-gray-800/50 bg-gray-900/60 flex-shrink-0">
          {connectors.map(c => (
            <div key={c.id} className="flex items-center gap-1.5" title={`${c.displayName} — ${c.connected ? 'connected' : 'disconnected'}${c.eventCount ? ` · ${c.eventCount} events` : ''}`}>
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.connected ? '#22c55e' : '#6b7280' }}
              />
              <span className="text-[10px] text-gray-500 truncate max-w-20">{c.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Compact event card for minimal view ---

function MinimalEventCard({ event, isLatest, connectorName, onDismiss, onAction }: {
  event: ConnectorEvent;
  isLatest: boolean;
  connectorName: string;
  onDismiss: (id: string) => void;
  onAction: (connectorId: string, actionId: string, params?: unknown) => void;
}) {
  const isAttention = event.severity === 'attention' || event.severity === 'critical';
  const borderColor = isAttention ? '#ef4444' : (event.uiHints?.color ?? '#6366f1');
  const acknowledgeEvent = useDashboardStore(s => s.acknowledgeEvent);
  const isBlinking = useBlinkState(isLatest, event.id, event.timestamp);

  const setActivePanel = useDashboardStore(s => s.setActivePanel);
  const setSelectedSlackChannel = useDashboardStore(s => s.setSelectedSlackChannel);

  const hasFocusAction = event.uiHints?.actionButtons?.some(a => a.id === 'focus');
  const meta = event.metadata as Record<string, string> | undefined;
  const rawSessionId = meta?.sessionId;
  const sessionName = (rawSessionId && rawSessionId !== 'unknown' ? rawSessionId : null)
    ?? event.body?.match(/Session:\s*(.+)/)?.[1];
  const itermSessionId = meta?.itermSessionId;

  const isSlackEvent = event.eventType === 'message-received'
    || event.eventType === 'mention-received'
    || event.eventType === 'dm-received';

  const handleClick = () => {
    acknowledgeEvent(event.id);
    if (isSlackEvent) {
      const channel = (event.metadata as Record<string, string>)?.channel;
      if (channel) setSelectedSlackChannel(channel.replace(/^#/, ''));
      setActivePanel('slack');
    } else if (hasFocusAction) {
      onAction(event.connectorId, 'focus', { sessionName, itermSessionId });
    }
  };

  const diff = Date.now() - event.timestamp;
  const timeAgo = diff < 5_000 ? 'now' : diff < 60_000 ? `${Math.floor(diff / 1_000)}s` : `${Math.floor(diff / 60_000)}m`;

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-gray-900/80 hover:bg-gray-800/80 transition-colors ${(hasFocusAction || isSlackEvent) ? 'cursor-pointer' : ''}`}
      style={{ borderColor: `${borderColor}30`, borderLeftColor: borderColor, borderLeftWidth: 3 }}
      onClick={handleClick}
    >
      {/* Icon */}
      <div
        className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 text-[10px] ${isBlinking ? 'animate-blink' : ''}`}
        style={{ backgroundColor: `${borderColor}20`, color: borderColor }}
      >
        {isAttention ? '⚡' : event.severity === 'error' ? '✕' : '●'}
      </div>

      {/* Title — prefer body in minimal mode; strip redundant prefixes */}
      <span className="text-xs truncate flex-1 min-w-0">
        {minimalText(event.body, event.title, connectorName)}
      </span>

      {/* Connector + time */}
      <span className="text-[10px] text-gray-500 flex-shrink-0">{connectorName}</span>
      <span className="text-[10px] text-gray-600 flex-shrink-0">{timeAgo}</span>

      {/* Dismiss button */}
      <button
        className="text-gray-600 hover:text-gray-400 text-[10px] flex-shrink-0"
        onClick={(e) => { e.stopPropagation(); onDismiss(event.id); }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/** Build minimal display text: prefer title (shows which tab), fall back to body */
function minimalText(body: string | undefined, title: string, connectorName: string): string {
  let text = stripPrefix(title, connectorName) || body || title;
  // Strip "Session: " prefix — the icon already conveys context
  text = text.replace(/^Session:\s*/i, '');
  return text;
}

function stripPrefix(title: string, connectorName: string): string {
  for (const sep of [': ', ' - ', ' — ', ' ']) {
    const prefix = connectorName + sep;
    if (title.startsWith(prefix)) return title.slice(prefix.length);
  }
  return title;
}
