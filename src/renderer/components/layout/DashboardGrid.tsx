// ============================================================
// DashboardGrid - react-grid-layout powered drag/resize grid
// Used in fullscreen mode for customizable widget layout
// ============================================================

import { useCallback, useMemo, useEffect } from 'react';
import RGL, { WidthProvider } from 'react-grid-layout';
import { useDashboardStore } from '@renderer/store/dashboard';
import { useWindowSize } from '@renderer/hooks/useWindowSize';
import { ConnectorWidget } from '@renderer/components/widgets/ConnectorWidget';
import type { GridLayoutItem } from '@shared/types';
import type { Layout } from 'react-grid-layout';

const ReactGridLayout = WidthProvider(RGL);

export function DashboardGrid() {
  const { width } = useWindowSize();
  const activeEvents = useDashboardStore(s => s.activeEvents);
  const connectors = useDashboardStore(s => s.connectors);
  const dismissEvent = useDashboardStore(s => s.dismissEvent);
  const gridLayout = useDashboardStore(s => s.gridLayout);
  const gridEditMode = useDashboardStore(s => s.gridEditMode);
  const setGridLayout = useDashboardStore(s => s.setGridLayout);

  const columns = Math.max(1, Math.floor(width / 280));

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

  // Build connector list with events
  const connectorIds = useMemo(() => {
    const withEvents = [...eventsByConnector.keys()];
    const all = connectors.map(c => c.id);
    return [...new Set([...withEvents, ...all])];
  }, [connectors, eventsByConnector]);

  // Generate default layout if none saved
  const layout = useMemo((): Layout[] => {
    if (gridLayout.length > 0) {
      return gridLayout.map(item => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: item.minW ?? 1,
        minH: item.minH ?? 1,
      }));
    }

    return connectorIds.map((id, idx) => ({
      i: id,
      x: idx % columns,
      y: Math.floor(idx / columns),
      w: 1,
      h: 2,
      minW: 1,
      minH: 1,
    }));
  }, [gridLayout, connectorIds, columns]);

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    const items: GridLayoutItem[] = newLayout.map(l => ({
      i: l.i,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
    }));
    setGridLayout(items);

    // Auto-save layout
    window.iDashboard?.saveLayout('__last', { items, columns });
  }, [setGridLayout, columns]);

  const handleAction = useCallback((connectorId: string, actionId: string, params?: unknown) => {
    window.iDashboard?.executeAction(connectorId, actionId, params);
  }, []);

  // Load saved layout on mount
  useEffect(() => {
    window.iDashboard?.loadLayout('__last').then((saved: unknown) => {
      if (saved && typeof saved === 'object' && 'items' in saved) {
        const s = saved as { items: GridLayoutItem[] };
        setGridLayout(s.items);
      }
    });
  }, [setGridLayout]);

  const colWidth = Math.floor(width / columns);

  return (
    <div className="p-6 h-full overflow-y-auto">
      {gridEditMode && (
        <div className="mb-2 px-2 py-1.5 bg-indigo-900/30 border border-indigo-500/30 rounded-lg text-xs text-indigo-300 flex items-center justify-between">
          <span>Grid edit mode — drag and resize widgets</span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const items = gridLayout.length > 0 ? gridLayout : layout.map(l => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
                window.iDashboard?.saveLayout('default', { items, columns });
              }}
              className="px-2 py-0.5 bg-indigo-600 rounded text-white hover:bg-indigo-500"
            >
              Save Layout
            </button>
            <button
              onClick={() => useDashboardStore.getState().setGridEditMode(false)}
              className="px-2 py-0.5 bg-gray-600 rounded text-white hover:bg-gray-500"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <ReactGridLayout
        layout={layout}
        cols={columns}
        rowHeight={80}
        isDraggable={gridEditMode}
        isResizable={gridEditMode}
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
        margin={[16, 16]}
      >
        {connectorIds.map((id) => {
          const connector = connectors.find(c => c.id === id) ?? {
            id,
            type: 'unknown',
            displayName: id,
            connected: true,
            eventCount: 0,
          };
          const events = eventsByConnector.get(id) ?? [];

          return (
            <div key={id}>
              <ConnectorWidget
                connector={connector}
                events={events}
                containerWidth={colWidth}
                onDismiss={dismissEvent}
                onAction={handleAction}
              />
            </div>
          );
        })}
      </ReactGridLayout>
    </div>
  );
}
