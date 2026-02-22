// ============================================================
// useBlinkState - Blink the latest event's icon for up to 60s
// Stops when acknowledged (clicked) or when 60s elapsed.
// ============================================================

import { useState, useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';

const BLINK_MAX_MS = 60_000;

/**
 * Returns true if this event should be blinking right now.
 * Blinks only if `isLatest` is true, not yet acknowledged,
 * and the event arrived less than 60 seconds ago.
 */
export function useBlinkState(
  isLatest: boolean,
  eventId: string,
  eventTimestamp: number,
): boolean {
  const isAcknowledged = useDashboardStore(
    (s) => s.acknowledgedEvents.has(eventId),
  );

  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (!isLatest || isAcknowledged) {
      setIsBlinking(false);
      return;
    }

    const remaining = BLINK_MAX_MS - (Date.now() - eventTimestamp);

    if (remaining <= 0) {
      setIsBlinking(false);
      return;
    }

    setIsBlinking(true);

    const timer = setTimeout(() => {
      setIsBlinking(false);
    }, remaining);

    return () => clearTimeout(timer);
  }, [isLatest, isAcknowledged, eventId, eventTimestamp]);

  return isBlinking;
}
