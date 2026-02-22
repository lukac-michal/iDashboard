// ============================================================
// MinimalDashboard - Compact event ticker view
// Shows recent events with source filter only
// ============================================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import { useBlinkAnimation } from '@renderer/hooks/useBlinkAnimation';
import { SeverityBadge } from '@renderer/components/common/SeverityBadge';
import type { ConnectorEvent } from '@shared/types';

const RECENT_WINDOW_MS = 60_000;

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

  // Filter by connector, then pick recent events
  const displayEvents = useMemo(() => {
    const filtered = activeEvents.filter(e =>
      allSelected || selectedConnectors.has(e.connectorId),
    );

    const now = Date.now();
    const recent = filtered.filter(e => now - e.timestamp < RECENT_WINDOW_MS);

    // Show recent events, or the single most recent if none are within the window
    if (recent.length > 0) return recent;
    return filtered.length > 0 ? [filtered[0]] : [];
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
          {displayEvents.map(event => (
            <MinimalEventCard
              key={event.id}
              event={event}
              connectorName={connectors.find(c => c.id === event.connectorId)?.displayName ?? event.connectorId}
              onDismiss={dismissEvent}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Compact event card for minimal view ---

function MinimalEventCard({ event, connectorName, onDismiss, onAction }: {
  event: ConnectorEvent;
  connectorName: string;
  onDismiss: (id: string) => void;
  onAction: (connectorId: string, actionId: string, params?: unknown) => void;
}) {
  const isAttention = event.severity === 'attention' || event.severity === 'critical';
  const isBlinking = useBlinkAnimation(isAttention, event.uiHints?.blinkDurationMs, event.timestamp);
  const borderColor = event.uiHints?.color ?? '#6366f1';

  const hasFocusAction = event.uiHints?.actionButtons?.some(a => a.id === 'focus');
  const rawSessionId = (event.metadata as Record<string, string>)?.sessionId;
  const sessionName = (rawSessionId && rawSessionId !== 'unknown' ? rawSessionId : null)
    ?? event.body?.match(/Session:\s*(.+)/)?.[1];

  const handleClick = () => {
    if (hasFocusAction) {
      onAction(event.connectorId, 'focus', { sessionName });
    }
  };

  const diff = Date.now() - event.timestamp;
  const timeAgo = diff < 5_000 ? 'now' : diff < 60_000 ? `${Math.floor(diff / 1_000)}s` : `${Math.floor(diff / 60_000)}m`;

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-gray-900/80 hover:bg-gray-800/80 transition-colors ${hasFocusAction ? 'cursor-pointer' : ''}`}
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

      {/* Title */}
      <span className="text-xs truncate flex-1 min-w-0">{event.title}</span>

      {/* Connector + time */}
      <span className="text-[10px] text-gray-500 flex-shrink-0">{connectorName}</span>
      <span className="text-[10px] text-gray-600 flex-shrink-0">{timeAgo}</span>

      <SeverityBadge severity={event.severity} />

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
