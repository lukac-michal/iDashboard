// ============================================================
// ConnectorWidget - Displays events grouped by connector
// ============================================================

import { EventCard } from './EventCard';
import type { ConnectorEvent, ConnectorStatus } from '@shared/types';

interface ConnectorWidgetProps {
  connector: ConnectorStatus;
  events: ConnectorEvent[];
  containerWidth: number;
  latestEventId?: string;
  onDismiss: (eventId: string) => void;
  onAction: (connectorId: string, actionId: string, params?: unknown) => void;
}

export function ConnectorWidget({
  connector,
  events,
  containerWidth,
  latestEventId,
  onDismiss,
  onAction,
}: ConnectorWidgetProps) {
  if (events.length === 0 && !connector.connected) {
    return null;
  }

  return (
    <div className="animate-slide-in h-full flex flex-col" style={{ containerType: 'inline-size', containerName: 'widget' }}>
      <div className="space-y-3 flex-1">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            containerWidth={containerWidth}
            isLatest={event.id === latestEventId}
            onDismiss={onDismiss}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
}
