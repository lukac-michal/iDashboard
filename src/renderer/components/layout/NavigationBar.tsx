// ============================================================
// NavigationBar - Bottom tab bar for switching between panels
// ============================================================

import { useEffect, useMemo } from 'react';
import { useDashboardStore, type ViewPanel } from '@renderer/store/dashboard';

const historyTab: { id: ViewPanel; label: string; icon: string } = {
  id: 'history', label: 'History', icon: '☰',
};

const orchestratorTab: { id: ViewPanel; label: string; icon: string } = {
  id: 'orchestrator', label: 'Orchestrator', icon: '⚡',
};

const coreTabs: { id: ViewPanel; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  // history or orchestrator inserted dynamically
  { id: 'trends', label: 'Trends', icon: '◲' },
  { id: 'diagnostics', label: 'Health', icon: '♡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

const slackTab: { id: ViewPanel; label: string; icon: string } = {
  id: 'slack', label: 'Slack', icon: '💬',
};

const logsTab: { id: ViewPanel; label: string; icon: string } = {
  id: 'logs', label: 'Logs', icon: '▤',
};

export function NavigationBar() {
  const activePanel = useDashboardStore(s => s.activePanel);
  const setActivePanel = useDashboardStore(s => s.setActivePanel);
  const windowWidth = useDashboardStore(s => s.windowWidth);
  const debugEnabled = useDashboardStore(s => s.config?.debug?.enabled ?? false);
  const experimentalEnabled = useDashboardStore(s => s.config?.experimental?.enabled ?? false);
  const connectors = useDashboardStore(s => s.connectors);
  const hasSlack = connectors.some(c => c.type === 'slack' && c.enabled !== false);

  const tabs = useMemo(() => {
    const secondTab = experimentalEnabled ? orchestratorTab : historyTab;
    const base = [coreTabs[0], secondTab, ...coreTabs.slice(1)];
    // Insert Slack tab before Settings (last item in base)
    const withSlack = hasSlack
      ? [...base.slice(0, -1), slackTab, base[base.length - 1]]
      : base;
    return debugEnabled ? [...withSlack, logsTab] : withSlack;
  }, [debugEnabled, experimentalEnabled, hasSlack]);

  // Redirect to dashboard if the active panel's tab was removed (e.g. Slack disabled)
  useEffect(() => {
    if (!tabs.some(t => t.id === activePanel)) {
      setActivePanel('dashboard');
    }
  }, [tabs, activePanel, setActivePanel]);

  return (
    <nav className="flex items-center border-t border-gray-800/50 bg-gray-900/60">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActivePanel(tab.id)}
          className={`
            flex-1 flex items-center justify-center gap-2 py-2.5 text-xs transition-colors
            ${activePanel === tab.id
              ? 'text-indigo-400 bg-indigo-500/10'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
            }
          `}
        >
          <span className="text-sm">{tab.icon}</span>
          {windowWidth >= 600 && <span>{tab.label}</span>}
        </button>
      ))}
    </nav>
  );
}
