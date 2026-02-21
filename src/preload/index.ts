// ============================================================
// Preload Script - Exposes safe IPC bridge to renderer
// ============================================================

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc-channels';

const api = {
  // Events
  getEvents: () => ipcRenderer.invoke(IPC.EVENTS_LIST),
  getEventHistory: (opts: { limit?: number; since?: number }) =>
    ipcRenderer.invoke(IPC.EVENTS_HISTORY, opts),
  dismissEvent: (eventId: string) =>
    ipcRenderer.invoke(IPC.EVENTS_DISMISS, eventId),

  // Connectors
  getConnectors: () => ipcRenderer.invoke(IPC.CONNECTORS_LIST),

  // Actions
  executeAction: (connectorId: string, actionId: string, params?: unknown) =>
    ipcRenderer.invoke(IPC.ACTION_EXECUTE, { connectorId, actionId, params }),

  // Window
  setWindowMode: (mode: string) => ipcRenderer.invoke(IPC.WINDOW_MODE, mode),
  dockWindow: (position: string) => ipcRenderer.invoke(IPC.WINDOW_DOCK, position),
  minimizeWindow: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),

  // Config
  getConfig: () => ipcRenderer.invoke(IPC.CONFIG_GET),
  updateConfig: (partial: unknown) => ipcRenderer.invoke(IPC.CONFIG_UPDATE_PARTIAL, partial),

  // Connector management
  addConnector: (config: unknown) => ipcRenderer.invoke(IPC.CONNECTORS_ADD, config),
  updateConnector: (config: unknown) => ipcRenderer.invoke(IPC.CONNECTORS_UPDATE, config),
  removeConnector: (id: string) => ipcRenderer.invoke(IPC.CONNECTORS_REMOVE, id),

  // Network
  getNetworkStatus: () => ipcRenderer.invoke(IPC.NETWORK_STATUS),
  getConnectorHealth: () => ipcRenderer.invoke(IPC.CONNECTOR_HEALTH_ALL),

  // Layout persistence
  saveLayout: (name: string, layout: unknown) =>
    ipcRenderer.invoke(IPC.LAYOUT_SAVE, { name, layout }),
  loadLayout: (name: string) => ipcRenderer.invoke(IPC.LAYOUT_LOAD, name),
  listLayouts: () => ipcRenderer.invoke(IPC.LAYOUT_LIST),

  // Theme
  setTheme: (theme: string) => ipcRenderer.invoke(IPC.THEME_SET, theme),
  getCustomThemes: () => ipcRenderer.invoke(IPC.THEME_GET_CUSTOM),

  // Aggregates
  queryAggregates: (query: unknown) => ipcRenderer.invoke(IPC.AGGREGATES_QUERY, query),

  // Data export
  exportEvents: (options: unknown) => ipcRenderer.invoke(IPC.EXPORT_EVENTS, options),

  // Sound
  testSound: () => ipcRenderer.invoke(IPC.SOUND_TEST),

  // Rules
  getRules: () => ipcRenderer.invoke(IPC.RULES_LIST),
  saveRules: (rules: unknown) => ipcRenderer.invoke(IPC.RULES_SAVE, rules),

  // Auth
  startAuth: (connectorId: string) => ipcRenderer.invoke(IPC.AUTH_START, connectorId),
  getAuthStatus: (connectorId: string) => ipcRenderer.invoke(IPC.AUTH_STATUS, connectorId),
  revokeAuth: (connectorId: string) => ipcRenderer.invoke(IPC.AUTH_REVOKE, connectorId),

  // Subscriptions (main → renderer push)
  onEvent: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(IPC.EVENTS_STREAM, handler);
    return () => ipcRenderer.removeListener(IPC.EVENTS_STREAM, handler);
  },

  onConfigChanged: (callback: (config: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(IPC.CONFIG_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.CONFIG_CHANGED, handler);
  },

  onNetworkChanged: (callback: (status: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(IPC.NETWORK_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.NETWORK_CHANGED, handler);
  },
};

contextBridge.exposeInMainWorld('iDashboard', api);

export type IDashboardAPI = typeof api;
