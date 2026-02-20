// ============================================================
// useBlinkAnimation - Track blink state for attention events
// ============================================================

import { useState, useEffect } from 'react';

export function useBlinkAnimation(
  isAttention: boolean,
  blinkDurationMs?: number,
  startTimestamp?: number,
): boolean {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (!isAttention || !blinkDurationMs) {
      setIsBlinking(false);
      return;
    }

    const start = startTimestamp ?? Date.now();
    const remaining = blinkDurationMs - (Date.now() - start);

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
