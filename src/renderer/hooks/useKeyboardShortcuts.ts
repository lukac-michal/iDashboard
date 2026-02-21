// ============================================================
// useKeyboardShortcuts - Handle app-scoped keyboard shortcuts
// ============================================================

import { useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';

export function useKeyboardShortcuts() {
  const setActivePanel = useDashboardStore(s => s.setActivePanel);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+, → Settings
      if (ctrl && e.key === ',') {
        e.preventDefault();
        setActivePanel('settings');
        return;
      }

      // Ctrl+K → Search / History
      if (ctrl && e.key === 'k') {
        e.preventDefault();
        setActivePanel('history');
        return;
      }

      // Ctrl+Shift+E → Export
      if (ctrl && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        window.iDashboard?.exportEvents({ format: 'json' });
        return;
      }

      // Ctrl+Shift+X → Dismiss all (handled by main process for global)
      if (ctrl && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        return;
      }

      // Escape → Back to dashboard
      if (e.key === 'Escape') {
        const currentPanel = useDashboardStore.getState().activePanel;
        if (currentPanel !== 'dashboard') {
          setActivePanel('dashboard');
        }
      }

      // 1-5 for tab switching
      if (ctrl && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const panels = ['dashboard', 'history', 'trends', 'diagnostics', 'settings'] as const;
        const idx = parseInt(e.key) - 1;
        if (panels[idx]) setActivePanel(panels[idx]);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActivePanel]);
}
