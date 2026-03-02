// ============================================================
// TitleBar - Frameless window drag region + controls
// ============================================================

import { useDashboardStore } from '@renderer/store/dashboard';

export function TitleBar() {
  const activePanel = useDashboardStore(s => s.activePanel);
  const setActivePanel = useDashboardStore(s => s.setActivePanel);
  const gridEditMode = useDashboardStore(s => s.gridEditMode);
  const setGridEditMode = useDashboardStore(s => s.setGridEditMode);
  const config = useDashboardStore(s => s.config);
  const windowWidth = useDashboardStore(s => s.windowWidth);
  const windowHeight = useDashboardStore(s => s.windowHeight);
  const uiStyle = useDashboardStore(s => s.uiStyle);
  const setUiStyle = useDashboardStore(s => s.setUiStyle);

  const MINIMAL_SIZE = { width: 300, height: 200 };
  const NORMAL_SIZE = { width: 650, height: 480 };

  const setWindowSize = useDashboardStore(s => s.setWindowSize);

  const switchToStyle = (next: 'normal' | 'minimal') => {
    if (uiStyle === next) return;
    const size = next === 'minimal' ? MINIMAL_SIZE : NORMAL_SIZE;
    setUiStyle(next);
    setWindowSize(size.width, size.height);
    setActivePanel('dashboard');
    window.iDashboard?.updateConfig({ window: { uiStyle: next } });
    window.iDashboard?.resizeWindow(size.width, size.height);
  };

  const toggleUiStyle = () => switchToStyle(uiStyle === 'normal' ? 'minimal' : 'normal');

  const experimentalEnabled = config?.experimental?.enabled ?? false;

  return (
    <div className={`titlebar-drag flex items-center justify-between ${uiStyle === 'minimal' ? 'h-8 pl-8 pr-4' : 'h-12 pl-10 pr-6'} ${experimentalEnabled ? 'bg-amber-900/30 border-b border-amber-800/50' : 'bg-gray-900/60 border-b border-gray-800/50'} select-none`}>
      <div className="flex items-center gap-3 text-xs">
        <span className="font-medium">
          <span className="text-white">iDashboard</span>
          <span className="text-gray-500"> v{__APP_VERSION__}</span>
        </span>

        {experimentalEnabled && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-600/30 text-amber-400 border border-amber-600/40">
            Experimental
          </span>
        )}

        {config?.debug?.enabled && (
          <span className="text-gray-600 font-mono">{windowWidth}×{windowHeight}</span>
        )}
      </div>

      <div className="titlebar-no-drag flex items-center gap-1.5">
        {/* UI style toggle */}
        <button
          onClick={toggleUiStyle}
          className="h-5 px-2 flex items-center justify-center rounded text-[10px] bg-gray-700/80 text-gray-300 hover:bg-gray-600 hover:text-gray-100"
          title={`Switch to ${uiStyle === 'normal' ? 'Minimal' : 'Normal'} view`}
        >
          {uiStyle === 'normal' ? 'Normal' : 'Minimal'}
        </button>

        {/* Grid edit toggle */}
        {activePanel === 'dashboard' && uiStyle === 'normal' && (
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
          onClick={() => {
            if (activePanel === 'settings') {
              setActivePanel('dashboard');
            } else {
              if (uiStyle === 'minimal') switchToStyle('normal');
              setActivePanel('settings');
            }
          }}
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
