// ============================================================
// TitleBar - Frameless window drag region + controls
// ============================================================

import { useDashboardStore } from '@renderer/store/dashboard';

export function TitleBar() {
  const activeCount = useDashboardStore(s => s.activeEvents.length);
  const attentionCount = useDashboardStore(s =>
    s.activeEvents.filter(e => e.severity === 'attention' || e.severity === 'critical').length,
  );
  const activePanel = useDashboardStore(s => s.activePanel);
  const setActivePanel = useDashboardStore(s => s.setActivePanel);
  const gridEditMode = useDashboardStore(s => s.gridEditMode);
  const setGridEditMode = useDashboardStore(s => s.setGridEditMode);

  return (
    <div className="titlebar-drag flex items-center justify-between h-8 px-3 bg-gray-900/60 border-b border-gray-800/50 select-none">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="text-gray-400 font-medium cursor-pointer titlebar-no-drag"
          onClick={() => setActivePanel('dashboard')}
        >
          iDashboard
        </span>

        {activePanel === 'dashboard' && activeCount > 0 && (
          <span className="text-gray-600">
            {activeCount} event{activeCount !== 1 ? 's' : ''}
          </span>
        )}

        {activePanel === 'dashboard' && attentionCount > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-medium">
            {attentionCount} needs attention
          </span>
        )}

        {activePanel !== 'dashboard' && (
          <span className="text-gray-600 capitalize">{activePanel}</span>
        )}
      </div>

      <div className="titlebar-no-drag flex items-center gap-1">
        {/* Grid edit toggle */}
        {activePanel === 'dashboard' && (
          <button
            onClick={() => setGridEditMode(!gridEditMode)}
            className={`w-5 h-5 flex items-center justify-center rounded text-xs ${
              gridEditMode ? 'bg-indigo-600 text-white' : 'hover:bg-gray-700 text-gray-500 hover:text-gray-300'
            }`}
            title="Toggle grid edit mode"
          >
            ⊞
          </button>
        )}

        {/* Settings */}
        <button
          onClick={() => setActivePanel(activePanel === 'settings' ? 'dashboard' : 'settings')}
          className={`w-5 h-5 flex items-center justify-center rounded text-xs ${
            activePanel === 'settings' ? 'text-indigo-400' : 'hover:bg-gray-700 text-gray-500 hover:text-gray-300'
          }`}
          title="Settings"
        >
          ⚙
        </button>

        <button
          onClick={() => window.iDashboard?.minimizeWindow()}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 text-xs"
          title="Minimize"
        >
          −
        </button>
        <button
          onClick={() => window.iDashboard?.closeWindow()}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 text-xs"
          title="Hide"
        >
          ×
        </button>
      </div>
    </div>
  );
}
