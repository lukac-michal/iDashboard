// ============================================================
// EventHistoryPanel - Scrollable event log with filters
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import { SeverityBadge } from '@renderer/components/common/SeverityBadge';
import type { ConnectorEvent, EventSeverity } from '@shared/types';

const SEVERITY_OPTIONS: EventSeverity[] = ['info', 'warning', 'error', 'critical', 'attention'];
const PAGE_SIZE = 50;

export function EventHistoryPanel() {
  const connectors = useDashboardStore(s => s.connectors);
  const historyEvents = useDashboardStore(s => s.historyEvents);
  const historyFilter = useDashboardStore(s => s.historyFilter);
  const setHistoryEvents = useDashboardStore(s => s.setHistoryEvents);
  const setHistoryFilter = useDashboardStore(s => s.setHistoryFilter);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const events = await window.iDashboard?.getEventHistory({
        limit: PAGE_SIZE * (page + 1),
      }) as ConnectorEvent[] ?? [];
      setHistoryEvents(events);
    } finally {
      setLoading(false);
    }
  }, [page, setHistoryEvents]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredEvents = useMemo(() => {
    let filtered = historyEvents;

    if (historyFilter.connectorId) {
      filtered = filtered.filter(e => e.connectorId === historyFilter.connectorId);
    }
    if (historyFilter.severity) {
      filtered = filtered.filter(e => e.severity === historyFilter.severity);
    }
    if (historyFilter.search) {
      const q = historyFilter.search.toLowerCase();
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.body?.toLowerCase().includes(q) ||
        e.connectorId.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [historyEvents, historyFilter]);

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50 flex-wrap">
        <input
          type="text"
          placeholder="Search events..."
          value={historyFilter.search ?? ''}
          onChange={e => setHistoryFilter({ ...historyFilter, search: e.target.value || undefined })}
          className="bg-gray-800/60 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 flex-1 min-w-[120px] outline-none focus:border-indigo-500"
        />

        <select
          value={historyFilter.connectorId ?? ''}
          onChange={e => setHistoryFilter({ ...historyFilter, connectorId: e.target.value || undefined })}
          className="bg-gray-800/60 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
        >
          <option value="">All connectors</option>
          {connectors.map(c => (
            <option key={c.id} value={c.id}>{c.displayName}</option>
          ))}
        </select>

        <select
          value={historyFilter.severity ?? ''}
          onChange={e => setHistoryFilter({ ...historyFilter, severity: e.target.value || undefined })}
          className="bg-gray-800/60 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
        >
          <option value="">All severities</option>
          {SEVERITY_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <button
          onClick={loadHistory}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          Refresh
        </button>

        <button
          onClick={() => {
            window.iDashboard?.exportEvents({
              format: 'csv',
              connectorIds: historyFilter.connectorId ? [historyFilter.connectorId] : undefined,
            });
          }}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          Export
        </button>
      </div>

      {/* Event List */}
      <div className="flex-1 overflow-y-auto">
        {loading && filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            Loading...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            No events match the current filters
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {filteredEvents.map(event => (
              <HistoryRow key={event.id} event={event} />
            ))}
          </div>
        )}

        {/* Load more */}
        {filteredEvents.length >= PAGE_SIZE * (page + 1) && (
          <div className="p-3 text-center">
            <button
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-400"
            >
              Load more
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-3 py-1.5 border-t border-gray-800/50 text-[10px] text-gray-500">
        {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
        {historyFilter.search || historyFilter.connectorId || historyFilter.severity ? ' (filtered)' : ''}
      </div>
    </div>
  );
}

function HistoryRow({ event }: { event: ConnectorEvent }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(event.timestamp).toLocaleString();
  const borderColor = event.uiHints?.color ?? '#6366f1';

  return (
    <div
      className="px-3 py-2 hover:bg-gray-800/30 cursor-pointer animate-fade-in"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: borderColor }}
        />
        <span className="text-xs font-medium truncate flex-1">{event.title}</span>
        <SeverityBadge severity={event.severity} />
        <span className="text-[10px] text-gray-500 flex-shrink-0">{time}</span>
      </div>

      <div className="flex items-center gap-2 mt-0.5 pl-3.5">
        <span className="text-[10px] text-gray-600">{event.connectorId}</span>
        {event.category && (
          <span className="text-[10px] text-gray-600">· {event.category}</span>
        )}
        {event.durationMs != null && (
          <span className="text-[10px] text-gray-600">· {event.durationMs}ms</span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 pl-3.5 space-y-1 animate-fade-in">
          {event.body && (
            <p className="text-xs text-gray-400 whitespace-pre-wrap">{event.body}</p>
          )}
          {event.sourceUrl && (
            <p className="text-xs text-indigo-400 truncate">{event.sourceUrl}</p>
          )}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <pre className="text-[10px] text-gray-500 bg-gray-800/40 rounded p-1.5 overflow-auto max-h-32">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
