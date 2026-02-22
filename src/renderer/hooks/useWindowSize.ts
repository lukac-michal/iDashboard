// ============================================================
// useWindowSize - Reactive window dimensions
// ============================================================

import { useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';

export function useWindowSize() {
  const setWindowSize = useDashboardStore(s => s.setWindowSize);
  const width = useDashboardStore(s => s.windowWidth);
  const height = useDashboardStore(s => s.windowHeight);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    // Don't call handleResize() on mount — store is already initialized,
    // and calling it here would overwrite an intentional setWindowSize
    // (e.g., from style switch) with stale values before the window
    // has physically resized.

    return () => window.removeEventListener('resize', handleResize);
  }, [setWindowSize]);

  return { width, height };
}
