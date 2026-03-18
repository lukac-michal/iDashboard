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
  resizeWindow: (width: number, height: number) => ipcRenderer.invoke(IPC.WINDOW_RESIZE, { width, height }),
  minimizeWindow: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),

  // Config
  getConfig: () => ipcRenderer.invoke(IPC.CONFIG_GET),
  updateConfig: (partial: unknown) => ipcRenderer.invoke(IPC.CONFIG_UPDATE_PARTIAL, partial),

  // Connector management
  addConnector: (config: unknown) => ipcRenderer.invoke(IPC.CONNECTORS_ADD, config),
  updateConnector: (config: unknown) => ipcRenderer.invoke(IPC.CONNECTORS_UPDATE, config),
  removeConnector: (id: string) => ipcRenderer.invoke(IPC.CONNECTORS_REMOVE, id),
  getConnectorConfig: (id: string) => ipcRenderer.invoke(IPC.CONNECTORS_GET_CONFIG, id),

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

  // Logs
  getLogs: (search?: string) => ipcRenderer.invoke(IPC.LOGS_GET, { search }),

  // Auth
  startAuth: (connectorId: string) => ipcRenderer.invoke(IPC.AUTH_START, connectorId),
  getAuthStatus: (connectorId: string) => ipcRenderer.invoke(IPC.AUTH_STATUS, connectorId),
  revokeAuth: (connectorId: string) => ipcRenderer.invoke(IPC.AUTH_REVOKE, connectorId),

  // Agent orchestration
  getAgents: () => ipcRenderer.invoke(IPC.AGENTS_LIST),
  registerAgent: (info: unknown) => ipcRenderer.invoke(IPC.AGENTS_REGISTER, info),
  unregisterAgent: (agentId: string) => ipcRenderer.invoke(IPC.AGENTS_UNREGISTER, agentId),
  spawnAgent: (opts: unknown) => ipcRenderer.invoke(IPC.AGENT_SPAWN, opts),
  sendTextToAgent: (agentId: string, text: string) =>
    ipcRenderer.invoke(IPC.AGENT_SEND_TEXT, { agentId, text }),
  focusAgent: (agentId: string) => ipcRenderer.invoke(IPC.AGENT_FOCUS, agentId),
  getAgentMessages: () => ipcRenderer.invoke(IPC.AGENT_MESSAGES_LIST),
  routeTask: (agentId: string, task: string) =>
    ipcRenderer.invoke(IPC.MASTER_ROUTE_TASK, { agentId, task }),
  getMasterMessages: () => ipcRenderer.invoke(IPC.MASTER_MESSAGES),

  // Profiles
  getProfiles: () => ipcRenderer.invoke(IPC.PROFILES_LIST),

  // Force poll
  forcePollConnector: (connectorId: string) =>
    ipcRenderer.invoke(IPC.CONNECTORS_FORCE_POLL, connectorId),

  // Slack bidirectional
  slackSend: (channel: string, text: string, threadTs?: string) =>
    ipcRenderer.invoke(IPC.SLACK_SEND, { channel, text, threadTs }),
  slackGetChannels: () => ipcRenderer.invoke(IPC.SLACK_CHANNELS),

  // Slack Bridge hook installation
  installSlackBridgeHooks: () => ipcRenderer.invoke(IPC.SLACK_BRIDGE_INSTALL_HOOKS),

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

  onNavigate: (callback: (panel: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(IPC.APP_NAVIGATE, handler);
    return () => ipcRenderer.removeListener(IPC.APP_NAVIGATE, handler);
  },

  onAgentsChanged: (callback: (agents: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(IPC.AGENTS_STREAM, handler);
    return () => ipcRenderer.removeListener(IPC.AGENTS_STREAM, handler);
  },

  onAgentMessage: (callback: (message: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(IPC.AGENT_MESSAGES_STREAM, handler);
    return () => ipcRenderer.removeListener(IPC.AGENT_MESSAGES_STREAM, handler);
  },
};

contextBridge.exposeInMainWorld('iDashboard', api);

export type IDashboardAPI = typeof api;
