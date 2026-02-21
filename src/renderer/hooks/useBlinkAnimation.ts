// ============================================================
// useBlinkAnimation - Track blink state for attention events
// ============================================================

import { useState, useEffect } from 'react';

export function useBlinkAnimation(
  _isAttention: boolean,
  blinkDurationMs?: number,
  startTimestamp?: number,
): boolean {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (!blinkDurationMs) {
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
  }, [blinkDurationMs, startTimestamp]);

  return isBlinking;
}
