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
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [setWindowSize]);

  return { width, height };
}
