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
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
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
  const [editing, setEditing] = useState<ConnectorConfig | null>(null);
  const [showAdd, setShowAdd] = useState(false);

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

  const handleSave = async () => {
    if (!editing) return;
    if (showAdd) {
      await window.iDashboard?.addConnector(editing);
    } else {
      await window.iDashboard?.updateConnector(editing);
    }
    setEditing(null);
    setShowAdd(false);
  };

  const handleRemove = async (id: string) => {
    await window.iDashboard?.removeConnector(id);
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
            <div key={c.id} className="flex items-center gap-3 bg-gray-900/50 rounded-lg p-3 border border-gray-800/30">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.connected ? '#22c55e' : '#6b7280' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-200 truncate">{c.displayName}</div>
                <div className="text-[10px] text-gray-500">{c.type} · {c.id}</div>
              </div>
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

// --- About ---

function AboutSettings() {
  return (
    <div className="space-y-4">
      <SectionTitle>iDashboard</SectionTitle>
      <div className="space-y-2 text-xs text-gray-400">
        <p>Version: 0.1.0</p>
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

// --- Shared Components ---

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider pt-2">{children}</h3>;
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
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
        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Loading() {
  return <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>;
}
