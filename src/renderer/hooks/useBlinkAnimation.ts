// ============================================================
// useBlinkAnimation - Track blink state for attention events
// ============================================================

import { useState, useEffect } from 'react';

const DEFAULT_BLINK_DURATION_MS = 10_000;

export function useBlinkAnimation(
  isAttention: boolean,
  blinkDurationMs?: number,
  startTimestamp?: number,
): boolean {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (!isAttention) {
      setIsBlinking(false);
      return;
    }

    const duration = blinkDurationMs ?? DEFAULT_BLINK_DURATION_MS;
    const start = startTimestamp ?? Date.now();
    const remaining = duration - (Date.now() - start);

    if (remaining <= 0) {
      setIsBlinking(false);
      return;
    }

    setIsBlinking(true);

    const timer = setTimeout(() => {
      setIsBlinking(false);
    }, remaining);

    return () => clearTimeout(timer);
  }, [isAttention, blinkDurationMs, startTimestamp]);

  return isBlinking;
}
