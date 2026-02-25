// ============================================================
// AdaptiveGrid - Tabbed connector view with auto-tab-switching
// ============================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import { EventCard } from '@renderer/components/widgets/EventCard';

const SEVERITIES = ['info', 'warning', 'error', 'critical', 'attention'] as const;
const PAGE_SIZE = 8;

export function AdaptiveGrid() {
  const activeEvents = useDashboardStore(s => s.activeEvents);
  const connectors = useDashboardStore(s => s.connectors);
  const dismissEvent = useDashboardStore(s => s.dismissEvent);
  const eventCounter = useDashboardStore(s => s.eventCounter);
  const activeConnectorTab = useDashboardStore(s => s.activeConnectorTab);
  const setActiveConnectorTab = useDashboardStore(s => s.setActiveConnectorTab);

  const [selectedSeverities, setSelectedSeverities] = useState<Set<string>>(new Set());
  const [showSeverityFilter, setShowSeverityFilter] = useState(false);
  const [page, setPage] = useState(1);

  const prevCounterRef = useRef(eventCounter);

  // Build connector list from known connectors + orphan connectorIds
  const connectorList = useMemo(() => {
    const ids = new Set<string>();
    for (const c of connectors) ids.add(c.id);
    for (const e of activeEvents) ids.add(e.connectorId);
    return [...ids].map(id => {
      const c = connectors.find(x => x.id === id);
      return { value: id, label: c?.displayName ?? id };
    });
  }, [connectors, activeEvents]);

  // Count events per connector (before severity filter, so tab counts stay stable)
  const eventCountByConnector = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of activeEvents) {
      counts.set(e.connectorId, (counts.get(e.connectorId) ?? 0) + 1);
    }
    return counts;
  }, [activeEvents]);

  // Auto-tab-switch on new events
  useEffect(() => {
    if (eventCounter > prevCounterRef.current && activeEvents.length > 0) {
      const latestEvent = activeEvents[0];
      setActiveConnectorTab(latestEvent.connectorId);
    }
    prevCounterRef.current = eventCounter;
  }, [eventCounter, activeEvents, setActiveConnectorTab]);

  const allSeveritiesSelected = selectedSeverities.size === 0;
  const hasSeverityFilter = !allSeveritiesSelected;

  const toggleSeverity = useCallback((sev: string) => {
    setSelectedSeverities(prev => {
      const next = new Set(prev);
      if (next.has(sev)) {
        next.delete(sev);
      } else {
        next.add(sev);
      }
      if (next.size === SEVERITIES.length) return new Set();
      return next;
    });
  }, []);

  const selectAllSeverities = useCallback(() => setSelectedSeverities(new Set()), []);

  // Apply filters: connector tab + severity
  const hasFilters = activeConnectorTab !== null || hasSeverityFilter;
  const filteredEvents = useMemo(() => {
    return activeEvents.filter(e => {
      if (activeConnectorTab !== null && e.connectorId !== activeConnectorTab) return false;
      if (hasSeverityFilter && !selectedSeverities.has(e.severity)) return false;
      return true;
    });
  }, [activeEvents, activeConnectorTab, selectedSeverities, hasSeverityFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [filteredEvents.length, hasFilters]);

  const pagedEvents = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, safePage]);

  const handleAction = (connectorId: string, actionId: string, params?: unknown) => {
    window.iDashboard?.executeAction(connectorId, actionId, params);
  };

  const latestEventId = filteredEvents[0]?.id;

  const tabBase = 'px-3 py-1.5 text-[11px] cursor-pointer transition-colors select-none border-b-2';
  const tabActive = 'bg-indigo-500/20 text-indigo-300 border-indigo-400';
  const tabInactive = 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30 border-transparent';

  const chipBase = 'px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors select-none';
  const chipOn = 'bg-gray-700 text-gray-200';
  const chipOff = 'bg-transparent text-gray-500 hover:text-gray-400';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Connector tabs + filter icon */}
      <div className="flex items-center px-6 pt-2.5 pb-0 flex-shrink-0 border-b border-gray-800/50">
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          <button
            className={`${tabBase} ${activeConnectorTab === null ? tabActive : tabInactive}`}
            onClick={() => setActiveConnectorTab(null)}
          >
            All ({activeEvents.length})
          </button>
          {connectorList.map(c => (
            <button
              key={c.value}
              className={`${tabBase} ${activeConnectorTab === c.value ? tabActive : tabInactive}`}
              onClick={() => setActiveConnectorTab(c.value)}
            >
              {c.label} ({eventCountByConnector.get(c.value) ?? 0})
            </button>
          ))}
        </div>
        <button
          className={`ml-2 mb-0.5 w-7 h-7 flex items-center justify-center rounded transition-colors ${
            showSeverityFilter || hasSeverityFilter
              ? 'text-indigo-400 bg-indigo-500/15 hover:bg-indigo-500/25'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
          }`}
          onClick={() => setShowSeverityFilter(prev => !prev)}
          title="Toggle severity filter"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </button>
      </div>

      {/* Severity filter (collapsible) */}
      {showSeverityFilter && (
        <div className="flex items-center gap-2 px-6 py-2 flex-shrink-0 flex-wrap border-b border-gray-800/30">
          <span className="text-[10px] text-gray-600 mr-0.5">Severity:</span>
          <button
            className={`${chipBase} ${allSeveritiesSelected ? chipOn : chipOff}`}
            onClick={selectAllSeverities}
          >All</button>
          {SEVERITIES.map(sev => (
            <button
              key={sev}
              className={`${chipBase} ${!allSeveritiesSelected && selectedSeverities.has(sev) ? chipOn : allSeveritiesSelected ? chipOn : chipOff}`}
              onClick={() => toggleSeverity(sev)}
            >{sev.charAt(0).toUpperCase() + sev.slice(1)}</button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filteredEvents.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-gray-600 text-sm">
          <div className="text-center">
            <div className="text-2xl mb-2">○</div>
            <div>{hasFilters ? 'No events match filters' : 'No active events'}</div>
            <div className="text-xs text-gray-700 mt-1">
              {hasFilters
                ? 'Try adjusting your filters'
                : connectors.length > 0
                  ? `${connectors.filter(c => c.connected).length}/${connectors.length} connectors online`
                  : 'No connectors configured'}
            </div>
          </div>
        </div>
      ) : (

      /* Single-column event list */
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
        {pagedEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            containerWidth={800}
            isLatest={event.id === latestEventId}
            onDismiss={dismissEvent}
            onAction={handleAction}
          />
        ))}
      </div>
      )}

      {/* Status bar */}
      <div className="flex items-center px-6 py-2.5 border-t border-gray-800/50 flex-shrink-0">
        <span className="text-[10px] text-gray-500">
          {filteredEvents.length}{hasFilters ? ` / ${activeEvents.length}` : ''} event{filteredEvents.length !== 1 ? 's' : ''}
        </span>

        {totalPages > 1 && (
          <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
}

// --- Pagination Bar ---

function Pagination({ page, totalPages, onPageChange }: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(page));

  const btnClass = (enabled: boolean) =>
    `w-6 h-6 flex items-center justify-center rounded text-[11px] ${
      enabled
        ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200 cursor-pointer'
        : 'text-gray-700 cursor-default'
    }`;

  return (
    <div className="flex items-center gap-2 ml-auto select-none">
      <button className={btnClass(page > 1)} onClick={() => page > 1 && onPageChange(1)} title="First page">
        ⟪
      </button>
      <button className={btnClass(page > 1)} onClick={() => page > 1 && onPageChange(page - 1)} title="Previous page">
        ‹
      </button>

      {editing ? (
        <input
          className="w-8 h-6 text-center text-[11px] bg-gray-800 border border-gray-600 rounded text-gray-200 outline-none"
          value={inputVal}
          autoFocus
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={() => {
            const n = parseInt(inputVal, 10);
            if (n >= 1 && n <= totalPages) onPageChange(n);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const n = parseInt(inputVal, 10);
              if (n >= 1 && n <= totalPages) onPageChange(n);
              setEditing(false);
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          className="h-6 px-1.5 text-[11px] text-gray-300 hover:bg-gray-700 rounded cursor-pointer"
          onClick={() => { setInputVal(String(page)); setEditing(true); }}
          title="Click to jump to page"
        >
          {page} / {totalPages}
        </button>
      )}

      <button className={btnClass(page < totalPages)} onClick={() => page < totalPages && onPageChange(page + 1)} title="Next page">
        ›
      </button>
      <button className={btnClass(page < totalPages)} onClick={() => page < totalPages && onPageChange(totalPages)} title="Last page">
        ⟫
      </button>
    </div>
  );
}
