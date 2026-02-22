// ============================================================
// NavigationBar - Bottom tab bar for switching between panels
// ============================================================

import { useDashboardStore, type ViewPanel } from '@renderer/store/dashboard';

const tabs: { id: ViewPanel; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'history', label: 'History', icon: '☰' },
  { id: 'trends', label: 'Trends', icon: '◲' },
  { id: 'diagnostics', label: 'Health', icon: '♡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function NavigationBar() {
  const activePanel = useDashboardStore(s => s.activePanel);
  const setActivePanel = useDashboardStore(s => s.setActivePanel);
  const windowWidth = useDashboardStore(s => s.windowWidth);

  // Only show full nav in fullscreen/expanded modes
  if (windowWidth < 400) {
    return null;
  }

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
