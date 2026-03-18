// ============================================================
// SettingsPanel - Full settings UI with tabbed sections
// ============================================================

import { useState, useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import type {
  SettingsTab,
  AppConfig,
  ConnectorConfig,
  CrossConnectorRule,
  RuleCondition,
  RuleAction,
  GridLayoutItem,
} from '@shared/types';
import { CONNECTOR_TYPES } from '@shared/constants';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'network', label: 'Network' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'rules', label: 'Rules' },
  { id: 'debug', label: 'Debug' },
  { id: 'experimental', label: 'Experimental' },
  { id: 'about', label: 'About' },
];

export function SettingsPanel() {
  const settingsTab = useDashboardStore(s => s.settingsTab);
  const setSettingsTab = useDashboardStore(s => s.setSettingsTab);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-36 border-r border-gray-800/50 py-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSettingsTab(tab.id)}
            className={`w-full text-left px-4 py-2 text-xs transition-colors ${
              settingsTab === tab.id
                ? 'text-indigo-400 bg-indigo-500/10 border-r-2 border-indigo-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {settingsTab === 'general' && <GeneralSettings />}
        {settingsTab === 'connectors' && <ConnectorsSettings />}
        {settingsTab === 'appearance' && <AppearanceSettings />}
        {settingsTab === 'notifications' && <NotificationSettings />}
        {settingsTab === 'network' && <NetworkSettings />}
        {settingsTab === 'shortcuts' && <ShortcutsSettings />}
        {settingsTab === 'rules' && <RulesSettings />}
        {settingsTab === 'debug' && <DebugSettings />}
        {settingsTab === 'experimental' && <ExperimentalSettings />}
        {settingsTab === 'about' && <AboutSettings />}
      </div>
    </div>
  );
}

// --- General Settings ---

function GeneralSettings() {
  const config = useDashboardStore(s => s.config);
  if (!config) return <Loading />;

  const update = (partial: Partial<AppConfig>) => {
    window.iDashboard?.updateConfig(partial);
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Window</SectionTitle>
      <SettingRow label="Default Mode">
        <select
          value={config.window.defaultMode}
          onChange={e => update({ window: { ...config.window, defaultMode: e.target.value as AppConfig['window']['defaultMode'] } })}
          className="settings-select"
        >
          <option value="floating">Floating</option>
          <option value="docked">Docked</option>
          <option value="tray">Tray</option>
          <option value="fullscreen">Fullscreen</option>
        </select>
      </SettingRow>
      <SettingRow label="Opacity">
        <input
          type="range" min="0.3" max="1" step="0.05"
          value={config.window.opacity}
          onChange={e => update({ window: { ...config.window, opacity: parseFloat(e.target.value) } })}
          className="w-24"
        />
        <span className="text-xs text-gray-500 ml-2">{Math.round(config.window.opacity * 100)}%</span>
      </SettingRow>
      <SettingRow label="Always on Top">
        <ToggleSwitch
          checked={config.window.alwaysOnTop.permanent}
          onChange={v => update({ window: { ...config.window, alwaysOnTop: { ...config.window.alwaysOnTop, permanent: v } } })}
        />
      </SettingRow>

      <SectionTitle>Startup</SectionTitle>
      <SettingRow label="App Mode">
        <select
          value={config.startup.appMode}
          onChange={e => update({ startup: { ...config.startup, appMode: e.target.value as 'dock' | 'menubar' } })}
          className="settings-select"
        >
          <option value="dock">Dock App</option>
          <option value="menubar">Menu Bar</option>
        </select>
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">
          Dock App shows in the dock. Menu Bar hides the dock icon and runs as a tray-only app.
        </span>
      </div>
      <SettingRow label="Launch at Login">
        <ToggleSwitch
          checked={config.startup.launchAtLogin}
          onChange={v => update({ startup: { ...config.startup, launchAtLogin: v } })}
        />
      </SettingRow>
      <SettingRow label="Start Minimized">
        <ToggleSwitch
          checked={config.startup.startMinimized}
          onChange={v => update({ startup: { ...config.startup, startMinimized: v } })}
        />
      </SettingRow>
      <SettingRow label="Check for Updates">
        <ToggleSwitch
          checked={config.startup.checkForUpdates}
          onChange={v => update({ startup: { ...config.startup, checkForUpdates: v } })}
        />
      </SettingRow>

      <SectionTitle>API Server</SectionTitle>
      <SettingRow label="Port">
        <input
          type="number" value={config.api.port}
          onChange={e => update({ api: { ...config.api, port: parseInt(e.target.value) || 19280 } })}
          className="settings-input w-20"
        />
      </SettingRow>
      <SettingRow label="API Authentication">
        <ToggleSwitch
          checked={config.api.auth.enabled}
          onChange={v => update({ api: { ...config.api, auth: { ...config.api.auth, enabled: v } } })}
        />
      </SettingRow>

      <SectionTitle>Storage</SectionTitle>
      <SettingRow label="Event Retention (days)">
        <input
          type="number" value={config.storage.retentionDays}
          onChange={e => update({ storage: { ...config.storage, retentionDays: parseInt(e.target.value) || 30 } })}
          className="settings-input w-20"
        />
      </SettingRow>
      <SettingRow label="Aggregate Retention (days)">
        <input
          type="number" value={config.storage.aggregateRetentionDays}
          onChange={e => update({ storage: { ...config.storage, aggregateRetentionDays: parseInt(e.target.value) || 90 } })}
          className="settings-input w-20"
        />
      </SettingRow>
    </div>
  );
}

// --- Connectors Settings ---

function ConnectorsSettings() {
  const connectors = useDashboardStore(s => s.connectors);
  const setConnectors = useDashboardStore(s => s.setConnectors);
  const [editing, setEditing] = useState<ConnectorConfig | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newAppName, setNewAppName] = useState('');

  const connectorTypes = Object.values(CONNECTOR_TYPES);

  const handleAdd = () => {
    setEditing({
      id: `connector-${Date.now()}`,
      type: 'generic-http',
      displayName: 'New Connector',
      enabled: true,
      pollIntervalMs: 30000,
      auth: { type: 'none' },
      settings: {},
      ui: { icon: 'box', color: '#6366f1' },
    });
    setShowAdd(true);
  };

  const handleEdit = async (id: string) => {
    const config = await window.iDashboard?.getConnectorConfig(id) as ConnectorConfig | null;
    if (config) {
      setEditing(config);
      setShowAdd(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    let statuses;
    if (showAdd) {
      statuses = await window.iDashboard?.addConnector(editing);
    } else {
      statuses = await window.iDashboard?.updateConnector(editing);
    }
    if (Array.isArray(statuses)) setConnectors(statuses);
    setEditing(null);
    setShowAdd(false);
  };

  const handleRemove = async (id: string) => {
    const statuses = await window.iDashboard?.removeConnector(id);
    if (Array.isArray(statuses)) setConnectors(statuses);
  };

  const handleToggleEnabled = async (id: string, currentlyEnabled: boolean) => {
    const config = await window.iDashboard?.getConnectorConfig(id) as ConnectorConfig | null;
    if (!config) return;
    const statuses = await window.iDashboard?.updateConnector({ ...config, enabled: !currentlyEnabled });
    if (Array.isArray(statuses)) setConnectors(statuses);
  };

  // Terminal Apps helpers (for claude-code connector)
  const terminalApps: string[] = (editing?.settings?.terminalApps as string[] | undefined) ?? [];

  const setTerminalApps = (apps: string[]) => {
    if (!editing) return;
    setEditing({ ...editing, settings: { ...editing.settings, terminalApps: apps } });
  };

  const moveApp = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= terminalApps.length) return;
    const apps = [...terminalApps];
    [apps[index], apps[target]] = [apps[target], apps[index]];
    setTerminalApps(apps);
  };

  const removeApp = (index: number) => {
    setTerminalApps(terminalApps.filter((_, i) => i !== index));
  };

  const addApp = () => {
    const name = newAppName.trim();
    if (!name || terminalApps.includes(name)) return;
    setTerminalApps([...terminalApps, name]);
    setNewAppName('');
  };

  // Slack settings helpers
  const [newChannel, setNewChannel] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  const slackChannels: string[] = (editing?.settings?.channels as string[] | undefined) ?? [];
  const slackKeywords: string[] = (editing?.settings?.keywordFilters as string[] | undefined) ?? [];
  const slackMentionAlerts: boolean = (editing?.settings?.mentionAlerts as boolean | undefined) ?? true;

  const setSlackSetting = (key: string, value: unknown) => {
    if (!editing) return;
    setEditing({ ...editing, settings: { ...editing.settings, [key]: value } });
  };

  const addChannel = () => {
    const ch = newChannel.trim();
    if (!ch || slackChannels.includes(ch)) return;
    setSlackSetting('channels', [...slackChannels, ch]);
    setNewChannel('');
  };

  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (!kw || slackKeywords.includes(kw)) return;
    setSlackSetting('keywordFilters', [...slackKeywords, kw]);
    setNewKeyword('');
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>{showAdd ? 'Add Connector' : 'Edit Connector'}</SectionTitle>
          <button onClick={() => { setEditing(null); setShowAdd(false); }} className="text-xs text-gray-400 hover:text-gray-200">
            Cancel
          </button>
        </div>

        <SettingRow label="ID">
          <input
            value={editing.id} disabled={!showAdd}
            onChange={e => setEditing({ ...editing, id: e.target.value })}
            className="settings-input flex-1"
          />
        </SettingRow>
        <SettingRow label="Display Name">
          <input
            value={editing.displayName}
            onChange={e => setEditing({ ...editing, displayName: e.target.value })}
            className="settings-input flex-1"
          />
        </SettingRow>
        <SettingRow label="Type">
          <select
            value={editing.type}
            onChange={e => setEditing({ ...editing, type: e.target.value })}
            className="settings-select"
          >
            {connectorTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Enabled">
          <ToggleSwitch
            checked={editing.enabled}
            onChange={v => setEditing({ ...editing, enabled: v })}
          />
        </SettingRow>
        <SettingRow label="Poll Interval (ms)">
          <input
            type="number" value={editing.pollIntervalMs}
            onChange={e => setEditing({ ...editing, pollIntervalMs: parseInt(e.target.value) || 30000 })}
            className="settings-input w-24"
          />
        </SettingRow>
        <SettingRow label="Auth Type">
          <select
            value={editing.auth.type}
            onChange={e => setEditing({ ...editing, auth: { ...editing.auth, type: e.target.value as ConnectorConfig['auth']['type'] } })}
            className="settings-select"
          >
            <option value="none">None</option>
            <option value="apiKey">API Key</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
            <option value="pat">Personal Access Token</option>
            <option value="oauth-device-flow">OAuth Device Flow</option>
            <option value="oauth-authorization-code">OAuth Auth Code</option>
          </select>
        </SettingRow>
        {(editing.auth.type === 'bearer' || editing.auth.type === 'pat' || editing.auth.type === 'apiKey') && (
          <SettingRow label="Token">
            <input
              type="password" value={editing.auth.token ?? ''}
              onChange={e => setEditing({ ...editing, auth: { ...editing.auth, token: e.target.value } })}
              className="settings-input flex-1" placeholder="${ENV_VAR} or literal"
            />
          </SettingRow>
        )}
        <SettingRow label="Widget Color">
          <input
            type="color" value={editing.ui.color}
            onChange={e => setEditing({ ...editing, ui: { ...editing.ui, color: e.target.value } })}
            className="w-8 h-8 rounded border border-gray-600 cursor-pointer"
          />
        </SettingRow>

        {/* Terminal Apps editor for claude-code connectors */}
        {editing.type === 'claude-code' && (
          <>
            <SectionTitle>Terminal Apps</SectionTitle>
            <div className="text-[10px] text-gray-500 -mt-1 mb-1">
              Apps are searched in order when focusing terminal. First app is the fallback.
            </div>
            <div className="space-y-1">
              {terminalApps.map((app, i) => (
                <div key={i} className="flex items-center gap-1 bg-gray-900/50 rounded px-2 py-1 border border-gray-800/30">
                  <span className="text-xs text-gray-200 flex-1">{app}</span>
                  <button
                    onClick={() => moveApp(i, -1)}
                    disabled={i === 0}
                    className="text-[10px] text-gray-400 hover:text-gray-200 disabled:opacity-30 px-1"
                    title="Move up"
                  >^</button>
                  <button
                    onClick={() => moveApp(i, 1)}
                    disabled={i === terminalApps.length - 1}
                    className="text-[10px] text-gray-400 hover:text-gray-200 disabled:opacity-30 px-1"
                    title="Move down"
                  >v</button>
                  <button
                    onClick={() => removeApp(i)}
                    className="text-[10px] text-red-400 hover:text-red-300 px-1"
                    title="Remove"
                  >x</button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                value={newAppName}
                onChange={e => setNewAppName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addApp(); }}
                placeholder="App name (e.g. Warp)"
                className="settings-input flex-1"
              />
              <button
                onClick={addApp}
                disabled={!newAppName.trim()}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </>
        )}

        {/* Slack settings editor */}
        {editing.type === 'slack' && (
          <>
            <SlackSetupGuideButton />

            <SectionTitle>Channels</SectionTitle>
            <div className="space-y-1">
              {slackChannels.map((ch, i) => (
                <div key={i} className="flex items-center gap-1 bg-gray-900/50 rounded px-2 py-1 border border-gray-800/30">
                  <span className="text-xs text-gray-200 flex-1">{ch}</span>
                  <button
                    onClick={() => setSlackSetting('channels', slackChannels.filter((_, j) => j !== i))}
                    className="text-[10px] text-red-400 hover:text-red-300 px-1"
                    title="Remove"
                  >x</button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                value={newChannel}
                onChange={e => setNewChannel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addChannel(); }}
                placeholder="#channel-name"
                className="settings-input flex-1"
              />
              <button
                onClick={addChannel}
                disabled={!newChannel.trim()}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-40"
              >
                Add
              </button>
            </div>

            <SectionTitle>Keyword Filters</SectionTitle>
            <div className="text-[10px] text-gray-500 -mt-1 mb-1">
              Empty = all messages
            </div>
            <div className="space-y-1">
              {slackKeywords.map((kw, i) => (
                <div key={i} className="flex items-center gap-1 bg-gray-900/50 rounded px-2 py-1 border border-gray-800/30">
                  <span className="text-xs text-gray-200 flex-1">{kw}</span>
                  <button
                    onClick={() => setSlackSetting('keywordFilters', slackKeywords.filter((_, j) => j !== i))}
                    className="text-[10px] text-red-400 hover:text-red-300 px-1"
                    title="Remove"
                  >x</button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addKeyword(); }}
                placeholder="keyword"
                className="settings-input flex-1"
              />
              <button
                onClick={addKeyword}
                disabled={!newKeyword.trim()}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-40"
              >
                Add
              </button>
            </div>

            <SectionTitle>Mention Alerts</SectionTitle>
            <SettingRow label="Highlight @mentions">
              <ToggleSwitch
                checked={slackMentionAlerts}
                onChange={v => setSlackSetting('mentionAlerts', v)}
              />
            </SettingRow>
            <div className="pl-40 -mt-1 mb-1">
              <span className="text-[10px] text-gray-500">
                Highlight messages with @mentions
              </span>
            </div>

            <SectionTitle>DM Monitoring</SectionTitle>
            <SettingRow label="Monitor DMs">
              <ToggleSwitch
                checked={(editing?.settings?.dmEnabled as boolean | undefined) ?? false}
                onChange={v => setSlackSetting('dmEnabled', v)}
              />
            </SettingRow>
            <div className="pl-40 -mt-1 mb-1">
              <span className="text-[10px] text-gray-500">
                Monitor direct messages sent to the bot
              </span>
            </div>
          </>
        )}

        <div className="pt-3">
          <button onClick={handleSave} className="px-4 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-500">
            {showAdd ? 'Add Connector' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>Connectors</SectionTitle>
        <button onClick={handleAdd} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500">
          + Add Connector
        </button>
      </div>

      {connectors.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-8">
          No connectors configured
        </div>
      ) : (
        <div className="space-y-2">
          {connectors.map(c => (
            <div key={c.id} className={`flex items-center gap-3 bg-gray-900/50 rounded-lg p-3 border border-gray-800/30${c.enabled === false ? ' opacity-50' : ''}`}>
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.enabled === false ? '#6b7280' : c.connected ? '#22c55e' : '#ef4444' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-200 truncate">{c.displayName}</div>
                <div className="text-[10px] text-gray-500">
                  {c.type} · {c.id}{c.enabled === false ? ' · off' : ''}
                </div>
              </div>
              <button
                onClick={() => handleToggleEnabled(c.id, c.enabled !== false)}
                className={`relative w-8 h-4 rounded-full transition-colors duration-200 flex-shrink-0 ${c.enabled !== false ? 'bg-green-600' : 'bg-gray-600'}`}
                title={c.enabled !== false ? 'Disable connector' : 'Enable connector'}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200 ${c.enabled !== false ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <button
                onClick={() => handleEdit(c.id)}
                className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1"
              >
                Edit
              </button>
              <button
                onClick={() => handleRemove(c.id)}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Appearance Settings ---

function AppearanceSettings() {
  const currentTheme = useDashboardStore(s => s.currentThemeName);
  const setThemeColors = useDashboardStore(s => s.setThemeColors);
  const [themes, setThemes] = useState<string[]>([]);

  useEffect(() => {
    window.iDashboard?.getCustomThemes().then((data: { current: string; available: string[] }) => {
      setThemes(data?.available ?? ['dark', 'light']);
    });
  }, []);

  const handleThemeChange = async (name: string) => {
    const result = await window.iDashboard?.setTheme(name) as { ok: boolean; colors?: Record<string, string>; cssVars?: Record<string, string> } | undefined;
    if (result?.ok && result.cssVars) {
      // Apply CSS variables
      const root = document.documentElement;
      for (const [key, value] of Object.entries(result.cssVars)) {
        root.style.setProperty(key, value);
      }
      setThemeColors(result.colors as unknown as Parameters<typeof setThemeColors>[0], name);
    }
  };

  const config = useDashboardStore(s => s.config);
  const gridEditMode = useDashboardStore(s => s.gridEditMode);
  const setGridEditMode = useDashboardStore(s => s.setGridEditMode);

  return (
    <div className="space-y-4">
      <SectionTitle>Theme</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {themes.map(name => (
          <button
            key={name}
            onClick={() => handleThemeChange(name)}
            className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
              currentTheme === name
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <SectionTitle>Layout</SectionTitle>
      <SettingRow label="Grid Edit Mode">
        <ToggleSwitch
          checked={gridEditMode}
          onChange={setGridEditMode}
        />
        <span className="text-[10px] text-gray-500 ml-2">Enable drag/resize in dashboard</span>
      </SettingRow>

      <div className="flex gap-2">
        <button
          onClick={() => window.iDashboard?.saveLayout('default', { items: useDashboardStore.getState().gridLayout, columns: 4 })}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          Save Current Layout
        </button>
        <button
          onClick={async () => {
            const saved = await window.iDashboard?.loadLayout('default') as { items?: unknown[] } | null;
            if (saved?.items) {
              useDashboardStore.getState().setGridLayout(saved.items as GridLayoutItem[]);
            }
          }}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          Load Default Layout
        </button>
      </div>
    </div>
  );
}

// --- Notification Settings ---

function NotificationSettings() {
  const config = useDashboardStore(s => s.config);
  if (!config) return <Loading />;

  const update = (partial: Partial<AppConfig>) => {
    window.iDashboard?.updateConfig(partial);
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Sound</SectionTitle>
      <SettingRow label="Enable Sound">
        <ToggleSwitch
          checked={config.notifications.sound.enabled}
          onChange={v => update({ notifications: { ...config.notifications, sound: { ...config.notifications.sound, enabled: v } } })}
        />
      </SettingRow>
      <SettingRow label="Volume">
        <input
          type="range" min="0" max="1" step="0.1"
          value={config.notifications.sound.volume}
          onChange={e => update({ notifications: { ...config.notifications, sound: { ...config.notifications.sound, volume: parseFloat(e.target.value) } } })}
          className="w-24"
        />
        <span className="text-xs text-gray-500 ml-2">{Math.round(config.notifications.sound.volume * 100)}%</span>
      </SettingRow>
      <SettingRow label="Test Sound">
        <button
          onClick={() => window.iDashboard?.testSound()}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          Play
        </button>
      </SettingRow>

      <SectionTitle>Behavior</SectionTitle>
      <SettingRow label="Native Notifications">
        <ToggleSwitch
          checked={config.notifications.nativeNotification}
          onChange={v => update({ notifications: { ...config.notifications, nativeNotification: v } })}
        />
      </SettingRow>
      <SettingRow label="Tray Badge">
        <ToggleSwitch
          checked={config.notifications.trayIconBadge}
          onChange={v => update({ notifications: { ...config.notifications, trayIconBadge: v } })}
        />
      </SettingRow>

      <SectionTitle>Attention Events</SectionTitle>
      <SettingRow label="Surface on Notification">
        <ToggleSwitch
          checked={config.window.alwaysOnTop.onNotification.enabled}
          onChange={v => update({
            window: {
              ...config.window,
              alwaysOnTop: {
                ...config.window.alwaysOnTop,
                onNotification: { ...config.window.alwaysOnTop.onNotification, enabled: v },
              },
            },
          })}
        />
      </SettingRow>
      <SettingRow label="Duration (sec)">
        <input
          type="number" value={config.window.alwaysOnTop.onNotification.durationSec}
          onChange={e => update({
            window: {
              ...config.window,
              alwaysOnTop: {
                ...config.window.alwaysOnTop,
                onNotification: { ...config.window.alwaysOnTop.onNotification, durationSec: parseInt(e.target.value) || 30 },
              },
            },
          })}
          className="settings-input w-16"
        />
      </SettingRow>
    </div>
  );
}

// --- Network Settings ---

function NetworkSettings() {
  const config = useDashboardStore(s => s.config);
  if (!config) return <Loading />;

  const update = (partial: Partial<AppConfig>) => {
    window.iDashboard?.updateConfig(partial);
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Circuit Breaker</SectionTitle>
      <SettingRow label="Failure Threshold">
        <input
          type="number" value={config.network.circuitBreaker.failureThreshold}
          onChange={e => update({
            network: {
              ...config.network,
              circuitBreaker: { ...config.network.circuitBreaker, failureThreshold: parseInt(e.target.value) || 5 },
            },
          })}
          className="settings-input w-16"
        />
      </SettingRow>
      <SettingRow label="Max Backoff (ms)">
        <input
          type="number" value={config.network.circuitBreaker.maxBackoffMs}
          onChange={e => update({
            network: {
              ...config.network,
              circuitBreaker: { ...config.network.circuitBreaker, maxBackoffMs: parseInt(e.target.value) || 300000 },
            },
          })}
          className="settings-input w-24"
        />
      </SettingRow>
      <SettingRow label="DNS Check Timeout (ms)">
        <input
          type="number" value={config.network.dnsCheckTimeoutMs}
          onChange={e => update({
            network: { ...config.network, dnsCheckTimeoutMs: parseInt(e.target.value) || 3000 },
          })}
          className="settings-input w-20"
        />
      </SettingRow>
    </div>
  );
}

// --- Shortcuts Settings ---

function ShortcutsSettings() {
  const shortcuts = [
    { keys: 'Ctrl+Shift+D', description: 'Show/hide dashboard' },
    { keys: 'Ctrl+Shift+F', description: 'Toggle fullscreen' },
    { keys: 'Ctrl+Shift+X', description: 'Dismiss all events' },
    { keys: 'Ctrl+,', description: 'Open settings' },
    { keys: 'Ctrl+K', description: 'Focus search' },
    { keys: 'Ctrl+R', description: 'Refresh connectors' },
    { keys: 'Ctrl+Shift+E', description: 'Export data' },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle>Keyboard Shortcuts</SectionTitle>
      <div className="space-y-1">
        {shortcuts.map(s => (
          <div key={s.keys} className="flex items-center justify-between py-2 px-1">
            <span className="text-xs text-gray-300">{s.description}</span>
            <kbd className="px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-400 font-mono">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Rules Settings ---

function RulesSettings() {
  const rules = useDashboardStore(s => s.rules);
  const setRules = useDashboardStore(s => s.setRules);
  const [editing, setEditing] = useState<CrossConnectorRule | null>(null);

  useEffect(() => {
    window.iDashboard?.getRules().then((r: CrossConnectorRule[]) => {
      setRules(r ?? []);
    });
  }, [setRules]);

  const handleSave = () => {
    if (!editing) return;
    const updatedRules = rules.some(r => r.id === editing.id)
      ? rules.map(r => r.id === editing.id ? editing : r)
      : [...rules, editing];
    setRules(updatedRules);
    window.iDashboard?.saveRules(updatedRules);
    setEditing(null);
  };

  const handleAdd = () => {
    setEditing({
      id: `rule-${Date.now()}`,
      name: 'New Rule',
      enabled: true,
      conditions: [{ field: 'severity', operator: 'equals', value: 'error' }],
      matchMode: 'all',
      actions: [{ type: 'escalate', params: { severity: 'attention' } }],
      priority: rules.length + 1,
    });
  };

  const handleDelete = (id: string) => {
    const updatedRules = rules.filter(r => r.id !== id);
    setRules(updatedRules);
    window.iDashboard?.saveRules(updatedRules);
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Edit Rule</SectionTitle>
          <button onClick={() => setEditing(null)} className="text-xs text-gray-400">Cancel</button>
        </div>
        <SettingRow label="Name">
          <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="settings-input flex-1" />
        </SettingRow>
        <SettingRow label="Enabled">
          <ToggleSwitch checked={editing.enabled} onChange={v => setEditing({ ...editing, enabled: v })} />
        </SettingRow>
        <SettingRow label="Match Mode">
          <select value={editing.matchMode} onChange={e => setEditing({ ...editing, matchMode: e.target.value as 'all' | 'any' })} className="settings-select">
            <option value="all">All conditions</option>
            <option value="any">Any condition</option>
          </select>
        </SettingRow>

        <SectionTitle>Conditions</SectionTitle>
        {editing.conditions.map((cond, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select value={cond.field} onChange={e => {
              const conditions = [...editing.conditions];
              conditions[i] = { ...cond, field: e.target.value as RuleCondition['field'] };
              setEditing({ ...editing, conditions });
            }} className="settings-select">
              {['severity', 'title', 'body', 'category', 'eventType', 'connectorId', 'status'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <select value={cond.operator} onChange={e => {
              const conditions = [...editing.conditions];
              conditions[i] = { ...cond, operator: e.target.value as RuleCondition['operator'] };
              setEditing({ ...editing, conditions });
            }} className="settings-select">
              {['equals', 'contains', 'matches', 'gt', 'lt'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <input value={cond.value} onChange={e => {
              const conditions = [...editing.conditions];
              conditions[i] = { ...cond, value: e.target.value };
              setEditing({ ...editing, conditions });
            }} className="settings-input flex-1" />
          </div>
        ))}

        <SectionTitle>Action</SectionTitle>
        <SettingRow label="Action Type">
          <select value={editing.actions[0]?.type ?? 'escalate'} onChange={e => {
            setEditing({ ...editing, actions: [{ type: e.target.value as RuleAction['type'], params: {} }] });
          }} className="settings-select">
            {['escalate', 'suppress', 'tag', 'notify', 'group'].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </SettingRow>

        <button onClick={handleSave} className="px-4 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-500">
          Save Rule
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>Cross-Connector Rules</SectionTitle>
        <button onClick={handleAdd} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500">
          + Add Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-8">
          No rules configured. Rules let you escalate, suppress, or tag events across connectors.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center gap-3 bg-gray-900/50 rounded-lg p-3 border border-gray-800/30">
              <div className={`w-2 h-2 rounded-full ${rule.enabled ? 'bg-green-400' : 'bg-gray-600'}`} />
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-200">{rule.name}</div>
                <div className="text-[10px] text-gray-500">
                  {rule.conditions.length} condition{rule.conditions.length !== 1 ? 's' : ''} → {rule.actions.map(a => a.type).join(', ')}
                </div>
              </div>
              <button onClick={() => setEditing(rule)} className="text-xs text-indigo-400 hover:text-indigo-300 px-2">Edit</button>
              <button onClick={() => handleDelete(rule.id)} className="text-xs text-red-400 hover:text-red-300 px-2">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Debug Settings ---

function DebugSettings() {
  const config = useDashboardStore(s => s.config);
  if (!config) return <Loading />;

  const update = (partial: Partial<AppConfig>) => {
    window.iDashboard?.updateConfig(partial);
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Debug Mode</SectionTitle>
      <SettingRow label="Enable Debug">
        <ToggleSwitch
          checked={config.debug?.enabled ?? false}
          onChange={v => update({ debug: { enabled: v } })}
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">
          Shows window dimensions in the title bar and exposes a Logs tab in the bottom navigation.
        </span>
      </div>
    </div>
  );
}

// --- About ---

function AboutSettings() {
  return (
    <div className="space-y-4">
      <SectionTitle>iDashboard</SectionTitle>
      <div className="space-y-2 text-xs text-gray-400">
        <p>Version: {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}</p>
        <p>A lightweight developer dashboard for unified tool monitoring and attention routing.</p>
        <p className="pt-2">Built with Electron, React, Zustand, Fastify, SQLite, and Drizzle ORM.</p>
      </div>

      <SectionTitle>Data</SectionTitle>
      <div className="flex gap-2">
        <button
          onClick={() => window.iDashboard?.exportEvents({ format: 'json' })}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          Export as JSON
        </button>
        <button
          onClick={() => window.iDashboard?.exportEvents({ format: 'csv' })}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          Export as CSV
        </button>
      </div>
    </div>
  );
}

// --- Experimental Settings ---

function ExperimentalSettings() {
  const config = useDashboardStore(s => s.config);
  if (!config) return <Loading />;

  const exp = config.experimental ?? { enabled: false, prompt: '', pmProfile: '', repoPath: '', agentProfilesDir: '', healthCheckIntervalMs: 10000 };

  const update = (partial: Partial<AppConfig['experimental']>) => {
    window.iDashboard?.updateConfig({ experimental: { ...exp, ...partial } });
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Experimental Mode</SectionTitle>
      <SettingRow label="Enable Experimental">
        <ToggleSwitch
          checked={exp.enabled}
          onChange={v => update({ enabled: v })}
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">
          Enables multi-agent orchestration. Replaces History tab with Orchestrator and shows an amber title bar badge.
        </span>
        <br />
        <span className="text-[10px] text-amber-500">
          Restart the app after toggling for agent spawning to take effect.
        </span>
      </div>

      <SectionTitle>Repository</SectionTitle>
      <SettingRow label="Repo Path">
        <input
          value={exp.repoPath}
          onChange={e => update({ repoPath: e.target.value })}
          className="settings-input flex-1"
          placeholder="/path/to/repo"
        />
      </SettingRow>
      <SettingRow label="Agent Profiles Dir">
        <input
          value={exp.agentProfilesDir}
          onChange={e => update({ agentProfilesDir: e.target.value })}
          className="settings-input flex-1"
          placeholder=".claude/agents/"
        />
      </SettingRow>

      <SectionTitle>Master Agent</SectionTitle>
      <div className="space-y-1">
        <span className="text-xs text-gray-400">System Prompt</span>
        <textarea
          value={exp.prompt}
          onChange={e => update({ prompt: e.target.value })}
          className="settings-input w-full h-24 resize-y"
          placeholder="Master agent system prompt..."
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-gray-400">PM Profile</span>
        <textarea
          value={exp.pmProfile}
          onChange={e => update({ pmProfile: e.target.value })}
          className="settings-input w-full h-24 resize-y"
          placeholder="PM agent profile markdown..."
        />
      </div>

      <SectionTitle>Health</SectionTitle>
      <SettingRow label="Health Check Interval (ms)">
        <input
          type="number"
          value={exp.healthCheckIntervalMs}
          onChange={e => update({ healthCheckIntervalMs: parseInt(e.target.value) || 10000 })}
          className="settings-input w-24"
        />
      </SettingRow>

      <SlackBridgeSettings />
    </div>
  );
}

// --- Slack Bridge Settings ---

function SlackBridgeSettings() {
  const config = useDashboardStore(s => s.config);
  if (!config) return null;

  const bridge = config.slackBridge ?? {
    enabled: false,
    targetChannel: '',
    forwardStop: true,
    forwardSubagentStop: true,
    forwardTaskComplete: true,
    forwardToolUse: false,
    forwardNeedsInput: true,
    forwardUserPrompt: true,
    threadingMode: 'continuous' as const,
    maxThreadMessages: 50,
    reverseEnabled: false,
    maxMessageLength: 3000,
  };

  const updateBridge = (partial: Partial<AppConfig['slackBridge']>) => {
    window.iDashboard?.updateConfig({ slackBridge: { ...bridge, ...partial } });
  };

  const [hookStatus, setHookStatus] = useState<'unknown' | 'checking' | 'installed' | 'not-installed'>('unknown');

  const installHooks = async () => {
    setHookStatus('checking');
    try {
      const result = await window.iDashboard?.installSlackBridgeHooks?.();
      setHookStatus(result?.ok ? 'installed' : 'not-installed');
    } catch {
      setHookStatus('not-installed');
    }
  };

  return (
    <>
      <SectionTitle>Slack Bridge</SectionTitle>
      <div className="pl-0 -mt-1 mb-2">
        <span className="text-[10px] text-gray-500">
          Forwards Claude Code output (final answers, tool results) to a Slack channel automatically.
        </span>
      </div>
      <SettingRow label="Enable Bridge">
        <ToggleSwitch
          checked={bridge.enabled}
          onChange={v => updateBridge({ enabled: v })}
        />
      </SettingRow>
      <SettingRow label="Target Channel">
        <input
          value={bridge.targetChannel}
          onChange={e => updateBridge({ targetChannel: e.target.value })}
          className="settings-input flex-1"
          placeholder="#claude-output or channel ID"
        />
      </SettingRow>

      <SectionTitle>Event Forwarding</SectionTitle>
      <SettingRow label="Stop Messages">
        <ToggleSwitch
          checked={bridge.forwardStop ?? true}
          onChange={v => updateBridge({ forwardStop: v })}
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">Claude's final answers</span>
      </div>
      <SettingRow label="Subagent Stop">
        <ToggleSwitch
          checked={bridge.forwardSubagentStop ?? true}
          onChange={v => updateBridge({ forwardSubagentStop: v })}
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">Subagent completions</span>
      </div>
      <SettingRow label="Task Complete">
        <ToggleSwitch
          checked={bridge.forwardTaskComplete ?? true}
          onChange={v => updateBridge({ forwardTaskComplete: v })}
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">Task completion events</span>
      </div>
      <SettingRow label="Tool Use">
        <ToggleSwitch
          checked={bridge.forwardToolUse}
          onChange={v => updateBridge({ forwardToolUse: v })}
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">Tool results (noisy)</span>
      </div>
      <SettingRow label="Needs Input">
        <ToggleSwitch
          checked={bridge.forwardNeedsInput ?? true}
          onChange={v => updateBridge({ forwardNeedsInput: v })}
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">When Claude waits for input</span>
      </div>
      <SettingRow label="User Prompts">
        <ToggleSwitch
          checked={bridge.forwardUserPrompt ?? true}
          onChange={v => updateBridge({ forwardUserPrompt: v })}
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">Your prompts to Claude</span>
      </div>

      <SectionTitle>Threading</SectionTitle>
      <SettingRow label="Threading Mode">
        <select
          value={bridge.threadingMode ?? 'continuous'}
          onChange={e => updateBridge({ threadingMode: e.target.value as 'continuous' | 'per-interaction' })}
          className="settings-select"
        >
          <option value="continuous">Continuous</option>
          <option value="per-interaction">Per Interaction</option>
        </select>
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">
          Per Interaction starts a new Slack thread each time you send a prompt.
        </span>
      </div>
      <SettingRow label="Max Thread Messages">
        <input
          type="number"
          value={bridge.maxThreadMessages ?? 50}
          onChange={e => updateBridge({ maxThreadMessages: parseInt(e.target.value) || 50 })}
          className="settings-input w-20"
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">
          Start a new thread after this many messages (prevents very long threads).
        </span>
      </div>

      <SectionTitle>Reverse Bridge</SectionTitle>
      <SettingRow label="Reverse Bridge">
        <ToggleSwitch
          checked={bridge.reverseEnabled}
          onChange={v => updateBridge({ reverseEnabled: v })}
        />
      </SettingRow>
      <div className="pl-40 -mt-1 mb-1">
        <span className="text-[10px] text-gray-500">
          Slack thread replies get typed into the Claude Code terminal (bidirectional).
          Requires the bridge channel to be in the Slack connector's monitored channels.
        </span>
      </div>
      <SettingRow label="Max Message Length">
        <input
          type="number"
          value={bridge.maxMessageLength}
          onChange={e => updateBridge({ maxMessageLength: parseInt(e.target.value) || 3000 })}
          className="settings-input w-20"
        />
      </SettingRow>

      <div className="mt-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/30">
        <div className="text-xs text-gray-300 font-medium mb-2">Claude Code Hooks</div>
        <div className="text-[10px] text-gray-500 mb-2">
          The bridge requires hooks in Claude Code's settings to capture output.
          Click below to auto-install them into ~/.claude/settings.json.
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={installHooks}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500"
          >
            Install Hooks
          </button>
          {hookStatus === 'installed' && (
            <span className="text-[10px] text-green-400">Hooks installed</span>
          )}
          {hookStatus === 'not-installed' && (
            <span className="text-[10px] text-red-400">Failed — check ~/.claude/settings.json manually</span>
          )}
          {hookStatus === 'checking' && (
            <span className="text-[10px] text-gray-400">Installing...</span>
          )}
        </div>
      </div>
    </>
  );
}

// --- Slack Setup Guide ---

function SlackSetupGuideButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded hover:bg-indigo-600/30 transition-colors"
      >
        <span>?</span>
        <span>Setup Guide</span>
      </button>
      {open && <SlackSetupGuideModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SlackSetupGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h3 className="text-sm font-medium text-gray-200">Slack Bot Setup Guide</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">x</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-gray-300 leading-relaxed">

          {/* Step 1 */}
          <GuideSection number={1} title="Create the Slack App">
            <ol className="list-decimal list-inside space-y-1 text-gray-400">
              <li>Go to <span className="text-indigo-300 font-mono">api.slack.com/apps</span></li>
              <li>Click <Strong>Create New App</Strong> &rarr; <Strong>From scratch</Strong></li>
              <li>Enter an app name (e.g. &quot;iDashboard Bot&quot;) and select your workspace</li>
              <li>Click <Strong>Create App</Strong></li>
            </ol>
          </GuideSection>

          {/* Step 2 */}
          <GuideSection number={2} title="Add Bot Token Scopes">
            <p className="text-gray-400 mb-2">
              In the app dashboard &rarr; <Strong>OAuth &amp; Permissions</Strong> &rarr; <Strong>Bot Token Scopes</Strong>, add:
            </p>
            <ScopeTable
              title="Channel monitoring (required)"
              scopes={[
                ['channels:history', 'Read public channel messages'],
                ['channels:read', 'List public channels'],
                ['chat:write', 'Send messages'],
              ]}
            />
            <ScopeTable
              title="DM monitoring (enable in settings below)"
              scopes={[
                ['im:history', 'Read DMs sent to the bot'],
                ['im:write', 'Open DM conversations'],
              ]}
            />
            <ScopeTable
              title="Optional extras"
              scopes={[
                ['groups:history', 'Read private channel messages'],
                ['groups:read', 'List private channels'],
                ['reactions:write', 'Add emoji reactions'],
                ['users:read', 'Resolve user display names'],
              ]}
            />
          </GuideSection>

          {/* Step 3 */}
          <GuideSection number={3} title="Install to Workspace">
            <ol className="list-decimal list-inside space-y-1 text-gray-400">
              <li>On the <Strong>OAuth &amp; Permissions</Strong> page, click <Strong>Install to Workspace</Strong></li>
              <li>Review and click <Strong>Allow</Strong></li>
              <li>Copy the <Strong>Bot User OAuth Token</Strong> &mdash; it starts with <code className="text-amber-300/80 bg-gray-800 px-1 rounded">xoxb-</code></li>
            </ol>
            <Tip>If you change scopes later, you must reinstall the app for changes to take effect.</Tip>
          </GuideSection>

          {/* Step 4 */}
          <GuideSection number={4} title="Configure in iDashboard">
            <ol className="list-decimal list-inside space-y-1.5 text-gray-400">
              <li>Set <Strong>Auth Type</Strong> to <Strong>Bearer Token</Strong></li>
              <li>Paste the <code className="text-amber-300/80 bg-gray-800 px-1 rounded">xoxb-...</code> token in the <Strong>Token</Strong> field</li>
              <li>Add channels below (e.g. <code className="text-amber-300/80 bg-gray-800 px-1 rounded">#general</code>)</li>
              <li>Optionally add keyword filters or enable mention alerts</li>
            </ol>
          </GuideSection>

          {/* Step 5 */}
          <GuideSection number={5} title="Invite the Bot to Channels">
            <p className="text-gray-400 mb-2">
              The bot can only read channels it has been invited to. In each Slack channel:
            </p>
            <code className="block bg-gray-800 rounded px-3 py-2 text-amber-300/80 font-mono">
              /invite @YourBotName
            </code>
          </GuideSection>

          {/* Step 6 - DM setup */}
          <GuideSection number={6} title="Enable DM Monitoring">
            <p className="text-gray-400 mb-2">
              To receive events when someone DMs the bot directly in Slack:
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-gray-400">
              <li>Ensure scopes <code className="text-amber-300/80 bg-gray-800 px-1 rounded">im:history</code> and <code className="text-amber-300/80 bg-gray-800 px-1 rounded">im:write</code> are added (step 2 above)</li>
              <li>Reinstall the app if you just added those scopes</li>
              <li>Toggle <Strong>Monitor DMs</Strong> on in the settings below</li>
              <li>iDashboard will auto-resolve the DM channel on next connector restart</li>
            </ol>
            <Tip>
              DM events appear with a &quot;Reply&quot; action button. The bot&apos;s own messages are automatically filtered out.
            </Tip>
          </GuideSection>

          {/* Troubleshooting */}
          <GuideSection number={7} title="Troubleshooting">
            <div className="space-y-2 text-gray-400">
              <TroubleshootItem
                problem="Connector shows disconnected"
                solution="Check the token is correct and starts with xoxb-. Verify the app is installed to the workspace."
              />
              <TroubleshootItem
                problem="No messages appear from a channel"
                solution="Invite the bot to the channel with /invite @BotName. Check the channel name matches exactly."
              />
              <TroubleshootItem
                problem="DM monitoring not working"
                solution="Ensure im:history and im:write scopes are added and the app is reinstalled. Check the connector status indicator."
              />
              <TroubleshootItem
                problem="Rate limit errors (429)"
                solution="Increase the poll interval in connector settings. Slack allows ~50 req/min for conversations.history."
              />
            </div>
          </GuideSection>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 bg-gray-700 text-gray-300 text-xs rounded hover:bg-gray-600">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function GuideSection({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
          {number}
        </span>
        <h4 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">{title}</h4>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function ScopeTable({ title, scopes }: { title: string; scopes: [string, string][] }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{title}</div>
      <div className="bg-gray-800/50 rounded border border-gray-700/50 divide-y divide-gray-700/30">
        {scopes.map(([scope, desc]) => (
          <div key={scope} className="flex items-center gap-3 px-3 py-1.5">
            <code className="text-amber-300/80 font-mono text-[11px] w-36 flex-shrink-0">{scope}</code>
            <span className="text-gray-400">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="text-gray-200 font-medium">{children}</span>;
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded px-3 py-2 text-indigo-200/80">
      <span className="flex-shrink-0">i</span>
      <span>{children}</span>
    </div>
  );
}

function TroubleshootItem({ problem, solution }: { problem: string; solution: string }) {
  return (
    <div className="bg-gray-800/50 rounded px-3 py-2 border border-gray-700/30">
      <div className="text-gray-300 font-medium mb-0.5">{problem}</div>
      <div className="text-gray-500">{solution}</div>
    </div>
  );
}

// --- Shared Components ---

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider pt-2">{children}</h3>;
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-gray-400 w-40 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-4.5 rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-600'
      }`}
    >
      <span
        className={`absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Loading() {
  return <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>;
}
