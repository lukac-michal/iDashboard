// ============================================================
// ConnectorWidget - Displays events grouped by connector
// ============================================================

import { HealthDot } from '@renderer/components/common/HealthDot';
import { EventCard } from './EventCard';
import type { ConnectorEvent, ConnectorStatus } from '@shared/types';

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
        {events.map((event) => (
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
