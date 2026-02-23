// ============================================================
// App - Root component with panel navigation
// ============================================================

import { useEffect } from 'react';
import { useIPCSync } from '@renderer/hooks/useIPCSync';
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts';
import { useWindowSize } from '@renderer/hooks/useWindowSize';
import { TitleBar } from '@renderer/components/layout/TitleBar';
import { NavigationBar } from '@renderer/components/layout/NavigationBar';
import { NetworkStatusBar } from '@renderer/components/common/NetworkStatusBar';
import { AdaptiveGrid } from '@renderer/components/layout/AdaptiveGrid';
import { DashboardGrid } from '@renderer/components/layout/DashboardGrid';
import { MinimalDashboard } from '@renderer/components/layout/MinimalDashboard';
import { EventHistoryPanel } from '@renderer/components/panels/EventHistoryPanel';
import { TrendChartsPanel } from '@renderer/components/panels/TrendChartsPanel';
import { NetworkDiagnosticsPanel } from '@renderer/components/panels/NetworkDiagnosticsPanel';
import { SettingsPanel } from '@renderer/components/panels/SettingsPanel';
import { LogsPanel } from '@renderer/components/panels/LogsPanel';
import { OrchestratorPanel } from '@renderer/components/panels/OrchestratorPanel';
import { SlackPanel } from '@renderer/components/panels/SlackPanel';
import { useDashboardStore } from '@renderer/store/dashboard';

export default function App() {
  useIPCSync();
  useKeyboardShortcuts();
  useWindowSize();

  const activePanel = useDashboardStore(s => s.activePanel);
  const windowWidth = useDashboardStore(s => s.windowWidth);
  const gridEditMode = useDashboardStore(s => s.gridEditMode);
  const isMinimal = useDashboardStore(s => s.uiStyle === 'minimal');

  // Use grid layout in fullscreen/expanded modes when edit mode is on
  const useGridLayout = gridEditMode && windowWidth >= 600;

  // Apply theme on mount
  useEffect(() => {
    window.iDashboard?.getCustomThemes().then((data: { current?: string } | undefined) => {
      if (data?.current && data.current !== 'dark') {
        window.iDashboard?.setTheme(data.current).then((result: { cssVars?: Record<string, string> } | undefined) => {
          if (result?.cssVars) {
            const root = document.documentElement;
            for (const [key, value] of Object.entries(result.cssVars)) {
              root.style.setProperty(key, value);
            }
          }
        });
      }
    });
  }, []);

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <TitleBar />
      <NetworkStatusBar />
      <main className="flex-1 min-h-0">
        {isMinimal ? (
          activePanel === 'settings' ? <SettingsPanel /> : <MinimalDashboard />
        ) : (
          <>
            {activePanel === 'dashboard' && (
              useGridLayout ? <DashboardGrid /> : <AdaptiveGrid />
            )}
            {activePanel === 'history' && <EventHistoryPanel />}
            {activePanel === 'orchestrator' && <OrchestratorPanel />}
            {activePanel === 'trends' && <TrendChartsPanel />}
            {activePanel === 'diagnostics' && <NetworkDiagnosticsPanel />}
            {activePanel === 'slack' && <SlackPanel />}
            {activePanel === 'settings' && <SettingsPanel />}
            {activePanel === 'logs' && <LogsPanel />}
          </>
        )}
      </main>
      {!isMinimal && <NavigationBar />}
    </div>
  );
}
