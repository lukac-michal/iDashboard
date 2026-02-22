// ============================================================
// AdaptiveGrid - Fluid layout based on window dimensions
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import { useWindowSize } from '@renderer/hooks/useWindowSize';
import { ConnectorWidget } from '@renderer/components/widgets/ConnectorWidget';
import { COLUMN_WIDTH_UNIT } from '@shared/constants';

const SEVERITIES = ['info', 'warning', 'error', 'critical', 'attention'] as const;

export function AdaptiveGrid() {
  const { width } = useWindowSize();
  const activeEvents = useDashboardStore(s => s.activeEvents);
  const connectors = useDashboardStore(s => s.connectors);
  const dismissEvent = useDashboardStore(s => s.dismissEvent);

  // Sets for multiselect — empty set means "all selected"
  const [selectedConnectors, setSelectedConnectors] = useState<Set<string>>(new Set());
  const [selectedSeverities, setSelectedSeverities] = useState<Set<string>>(new Set());

  const columns = Math.max(1, Math.floor(width / COLUMN_WIDTH_UNIT));

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

  const allConnectorsSelected = selectedConnectors.size === 0;
  const allSeveritiesSelected = selectedSeverities.size === 0;

  const toggleConnector = useCallback((id: string) => {
    setSelectedConnectors(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      // If all are now selected, reset to empty (= all)
      if (connectorList.length > 0 && next.size === connectorList.length) return new Set();
      return next;
    });
  }, [connectorList.length]);

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

  const selectAllConnectors = useCallback(() => setSelectedConnectors(new Set()), []);
  const selectAllSeverities = useCallback(() => setSelectedSeverities(new Set()), []);

  // Apply filters
  const hasFilters = !allConnectorsSelected || !allSeveritiesSelected;
  const filteredEvents = useMemo(() => {
    return activeEvents.filter(e => {
      if (!allConnectorsSelected && !selectedConnectors.has(e.connectorId)) return false;
      if (!allSeveritiesSelected && !selectedSeverities.has(e.severity)) return false;
      return true;
    });
  }, [activeEvents, selectedConnectors, selectedSeverities, allConnectorsSelected, allSeveritiesSelected]);

  // Group events by connector
  const eventsByConnector = useMemo(() => {
    const map = new Map<string, typeof filteredEvents>();
    for (const event of filteredEvents) {
      const existing = map.get(event.connectorId) ?? [];
      existing.push(event);
      map.set(event.connectorId, existing);
    }
    return map;
  }, [filteredEvents]);

  // Sort connectors: those with events first, then by priority
  const sortedConnectors = useMemo(() => {
    return [...connectors].sort((a, b) => {
      const aEvents = eventsByConnector.get(a.id)?.length ?? 0;
      const bEvents = eventsByConnector.get(b.id)?.length ?? 0;
      if (aEvents > 0 && bEvents === 0) return -1;
      if (bEvents > 0 && aEvents === 0) return 1;
      return 0;
    });
  }, [connectors, eventsByConnector]);

  const handleAction = (connectorId: string, actionId: string, params?: unknown) => {
    window.iDashboard?.executeAction(connectorId, actionId, params);
  };

  // For connectors with no status yet but have events, create a placeholder
  const connectorIds = new Set(connectors.map(c => c.id));
  const orphanEvents = [...eventsByConnector.entries()]
    .filter(([id]) => !connectorIds.has(id));

  const colWidth = Math.floor(width / columns);

  // Count how many connectors actually have events to display
  const activeConnectorCount = sortedConnectors.filter(c => (eventsByConnector.get(c.id)?.length ?? 0) > 0).length
    + orphanEvents.length;

  // Use fewer columns when there are fewer connectors with events
  const effectiveColumns = Math.max(1, Math.min(columns, activeConnectorCount));
  const effectiveColWidth = Math.floor(width / effectiveColumns);

  const chipBase = 'px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors select-none';
  const chipOn = 'bg-gray-700 text-gray-200';
  const chipOff = 'bg-transparent text-gray-500 hover:text-gray-400';

  return (
    <div className="p-6 h-full flex flex-col gap-3 overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        {/* Connector filter */}
        <span className="text-[10px] text-gray-600 mr-0.5">Source:</span>
        <button
          className={`${chipBase} ${allConnectorsSelected ? chipOn : chipOff}`}
          onClick={selectAllConnectors}
        >All</button>
        {connectorList.map(c => (
          <button
            key={c.value}
            className={`${chipBase} ${!allConnectorsSelected && selectedConnectors.has(c.value) ? chipOn : allConnectorsSelected ? chipOn : chipOff}`}
            onClick={() => toggleConnector(c.value)}
          >{c.label}</button>
        ))}

        <span className="text-gray-800 mx-1">|</span>

        {/* Severity filter */}
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

        <span className="text-[10px] text-gray-600 ml-auto">
          {filteredEvents.length}{hasFilters ? ` / ${activeEvents.length}` : ''} event{filteredEvents.length !== 1 ? 's' : ''}
        </span>
      </div>

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

      /* Event grid */
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${effectiveColumns}, 1fr)`,
          gap: '16px',
          alignContent: 'start',
        }}
      >
      {sortedConnectors.map((connector) => {
        const events = eventsByConnector.get(connector.id) ?? [];
        if (events.length === 0) return null;

        return (
          <ConnectorWidget
            key={connector.id}
            connector={connector}
            events={events}
            containerWidth={effectiveColWidth}
            onDismiss={dismissEvent}
            onAction={handleAction}
          />
        );
      })}

      {/* Orphan events from connectors not in the status list */}
      {orphanEvents.map(([connectorId, events]) => (
        <ConnectorWidget
          key={connectorId}
          connector={{
            id: connectorId,
            type: 'unknown',
            displayName: connectorId,
            connected: true,
            eventCount: events.length,
          }}
          events={events}
          containerWidth={effectiveColWidth}
          onDismiss={dismissEvent}
          onAction={handleAction}
        />
      ))}
      </div>
      )}
    </div>
  );
}
