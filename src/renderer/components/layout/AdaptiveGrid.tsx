// ============================================================
// AdaptiveGrid - Fluid layout based on window dimensions
// ============================================================

import { useMemo } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import { useWindowSize } from '@renderer/hooks/useWindowSize';
import { ConnectorWidget } from '@renderer/components/widgets/ConnectorWidget';
import { COLUMN_WIDTH_UNIT } from '@shared/constants';

export function AdaptiveGrid() {
  const { width } = useWindowSize();
  const activeEvents = useDashboardStore(s => s.activeEvents);
  const connectors = useDashboardStore(s => s.connectors);
  const dismissEvent = useDashboardStore(s => s.dismissEvent);

  const columns = Math.max(1, Math.floor(width / COLUMN_WIDTH_UNIT));

  // Group events by connector
  const eventsByConnector = useMemo(() => {
    const map = new Map<string, typeof activeEvents>();
    for (const event of activeEvents) {
      const existing = map.get(event.connectorId) ?? [];
      existing.push(event);
      map.set(event.connectorId, existing);
    }
    return map;
  }, [activeEvents]);

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

  const handleAction = (connectorId: string, actionId: string) => {
    window.iDashboard?.executeAction(connectorId, actionId);
  };

  // For connectors with no status yet but have events, create a placeholder
  const connectorIds = new Set(connectors.map(c => c.id));
  const orphanEvents = [...eventsByConnector.entries()]
    .filter(([id]) => !connectorIds.has(id));

  const colWidth = Math.floor(width / columns);

  if (activeEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        <div className="text-center">
          <div className="text-2xl mb-2">○</div>
          <div>No active events</div>
          <div className="text-xs text-gray-700 mt-1">
            {connectors.length > 0
              ? `${connectors.filter(c => c.connected).length}/${connectors.length} connectors online`
              : 'No connectors configured'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-2 h-full overflow-y-auto"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: '8px',
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
            containerWidth={colWidth}
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
          containerWidth={colWidth}
          onDismiss={dismissEvent}
          onAction={handleAction}
        />
      ))}
    </div>
  );
}
