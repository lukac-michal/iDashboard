// ============================================================
// ConnectorWidget - Displays events grouped by connector
// ============================================================

import { useState, useMemo, useEffect } from 'react';
import { HealthDot } from '@renderer/components/common/HealthDot';
import { EventCard } from './EventCard';
import type { ConnectorEvent, ConnectorStatus } from '@shared/types';

const PAGE_SIZE = 8;

interface ConnectorWidgetProps {
  connector: ConnectorStatus;
  events: ConnectorEvent[];
  containerWidth: number;
  onDismiss: (eventId: string) => void;
  onAction: (connectorId: string, actionId: string, params?: unknown) => void;
}

export function ConnectorWidget({
  connector,
  events,
  containerWidth,
  onDismiss,
  onAction,
}: ConnectorWidgetProps) {
  const showTitle = containerWidth >= 150;
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));

  // Reset to page 1 when new events arrive (total changes)
  useEffect(() => {
    setPage(1);
  }, [events.length]);

  const pagedEvents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return events.slice(start, start + PAGE_SIZE);
  }, [events, page]);

  if (events.length === 0 && !connector.connected) {
    return null;
  }

  return (
    <div className="animate-slide-in h-full flex flex-col" style={{ containerType: 'inline-size', containerName: 'widget' }}>
      {showTitle && (
        <div className="flex items-center gap-2 mb-3 px-2 flex-shrink-0">
          <HealthDot health={connector.health} />
          <span className="text-xs font-medium text-gray-400 truncate">
            {connector.displayName}
          </span>
          {connector.eventCount > 0 && (
            <span className="text-[10px] text-gray-600 ml-auto">
              {connector.eventCount} events
            </span>
          )}
        </div>
      )}

      <div className="space-y-3 flex-1">
        {pagedEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            containerWidth={containerWidth}
            onDismiss={onDismiss}
            onAction={onAction}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex-shrink-0">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
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
    <div className="flex items-center justify-center gap-2 mt-3 select-none">
      {/* First */}
      <button className={btnClass(page > 1)} onClick={() => page > 1 && onPageChange(1)} title="First page">
        ⟪
      </button>
      {/* Previous */}
      <button className={btnClass(page > 1)} onClick={() => page > 1 && onPageChange(page - 1)} title="Previous page">
        ‹
      </button>

      {/* Current page / editable input */}
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

      {/* Next */}
      <button className={btnClass(page < totalPages)} onClick={() => page < totalPages && onPageChange(page + 1)} title="Next page">
        ›
      </button>
      {/* Last */}
      <button className={btnClass(page < totalPages)} onClick={() => page < totalPages && onPageChange(totalPages)} title="Last page">
        ⟫
      </button>
    </div>
  );
}
