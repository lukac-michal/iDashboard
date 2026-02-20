// ============================================================
// ConnectorWidget - Displays events grouped by connector
// ============================================================

import { useMemo } from 'react';
import { HealthDot } from '@renderer/components/common/HealthDot';
import { EventCard } from './EventCard';
import type { ConnectorEvent, ConnectorStatus } from '@shared/types';

interface ConnectorWidgetProps {
  connector: ConnectorStatus;
  events: ConnectorEvent[];
  containerWidth: number;
  onDismiss: (eventId: string) => void;
  onAction: (connectorId: string, actionId: string) => void;
}

export function ConnectorWidget({
  connector,
  events,
  containerWidth,
  onDismiss,
  onAction,
}: ConnectorWidgetProps) {
  const showTitle = containerWidth >= 150;
  const showHistory = containerWidth >= 400;

  const recentEvents = useMemo(() => {
    return events.slice(0, showHistory ? 5 : 1);
  }, [events, showHistory]);

  if (events.length === 0 && !connector.connected) {
    return null;
  }

  return (
    <div className="animate-slide-in" style={{ containerType: 'inline-size', containerName: 'widget' }}>
      {showTitle && (
        <div className="flex items-center gap-2 mb-1.5 px-1">
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

      <div className="space-y-1.5">
        {recentEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            containerWidth={containerWidth}
            onDismiss={onDismiss}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
}
