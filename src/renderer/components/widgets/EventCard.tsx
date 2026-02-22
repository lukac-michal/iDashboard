// ============================================================
// EventCard - Single event display with adaptive sizing
// ============================================================

import { useDashboardStore } from '@renderer/store/dashboard';
import { useBlinkState } from '@renderer/hooks/useBlinkAnimation';
import { SeverityBadge } from '@renderer/components/common/SeverityBadge';
import { ActionButton } from '@renderer/components/common/ActionButton';
import type { ConnectorEvent } from '@shared/types';

interface EventCardProps {
  event: ConnectorEvent;
  containerWidth: number;
  isLatest?: boolean;
  onDismiss: (eventId: string) => void;
  onAction: (connectorId: string, actionId: string, params?: unknown) => void;
}

export function EventCard({ event, containerWidth, isLatest, onDismiss, onAction }: EventCardProps) {
  const isAttention = event.severity === 'attention' || event.severity === 'critical';
  const acknowledgeEvent = useDashboardStore(s => s.acknowledgeEvent);
  const isBlinking = useBlinkState(isLatest ?? false, event.id, event.timestamp);

  const showTitle = containerWidth >= 150;
  const showBody = containerWidth >= 300;
  const showActions = containerWidth >= 250;
  const showActionLabels = containerWidth >= 350;

  const borderColor = isAttention ? '#ef4444' : (event.uiHints?.color ?? '#6366f1');
  const timeAgo = formatTimeAgo(event.timestamp);

  const hasFocusAction = event.uiHints?.actionButtons?.some(a => a.id === 'focus');
  const rawSessionId = (event.metadata as Record<string, string>)?.sessionId;
  const sessionName = (rawSessionId && rawSessionId !== 'unknown' ? rawSessionId : null)
    ?? event.body?.match(/Session:\s*(.+)/)?.[1];

  const handleCardClick = () => {
    acknowledgeEvent(event.id);
    if (hasFocusAction) {
      onAction(event.connectorId, 'focus', { sessionName });
    }
  };

  return (
    <div
      className={`
        relative rounded-lg border overflow-hidden animate-fade-in
        bg-gray-900/80 hover:bg-gray-800/80 transition-colors
        ${hasFocusAction ? 'cursor-pointer' : ''}
      `}
      style={{ borderColor: `${borderColor}40`, borderLeftColor: borderColor, borderLeftWidth: 3 }}
      onClick={handleCardClick}
    >
      {(event as ConnectorEvent & { _seq?: number })._seq != null && (
        <span className="absolute top-1 right-1.5 text-[10px] text-gray-500 font-mono">
          #{(event as ConnectorEvent & { _seq?: number })._seq}
        </span>
      )}
      <div className="p-3 flex items-start gap-2">
        {/* Icon / status dot */}
        <div
          className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 text-xs ${isBlinking ? 'animate-blink' : ''}`}
          style={{ backgroundColor: `${borderColor}20`, color: borderColor }}
        >
          {isAttention ? '⚡' : event.severity === 'error' ? '✕' : '●'}
        </div>

        {/* Content */}
        {showTitle && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{event.title}</span>
              <SeverityBadge severity={event.severity} />
            </div>

            {showBody && event.body && (
              <p className="widget-body text-xs text-gray-400 mt-1.5 line-clamp-2">{event.body}</p>
            )}

            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-gray-500">{timeAgo}</span>

              {showActions && event.uiHints?.actionButtons && (
                <div className="widget-actions flex gap-1 ml-auto">
                  {event.uiHints.actionButtons.map((action) => (
                    <ActionButton
                      key={action.id}
                      action={action}
                      showLabel={showActionLabels}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (action.id === 'dismiss') {
                          onDismiss(event.id);
                        } else {
                          onAction(event.connectorId, action.id,
                            action.id === 'focus' ? { sessionName } : undefined);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Icon-only mode: just the dot */}
        {!showTitle && (
          <span
            className={`w-3 h-3 rounded-full ${isBlinking ? 'animate-blink' : ''}`}
            style={{ backgroundColor: borderColor }}
          />
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
