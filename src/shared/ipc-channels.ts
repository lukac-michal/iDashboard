// ============================================================
// iDashboard - IPC Channel Definitions
// Type-safe channel names for Electron IPC communication
// ============================================================

export const IPC = {
  // Event management
  EVENTS_PUSH: 'events:push',
  EVENTS_DISMISS: 'events:dismiss',
  EVENTS_LIST: 'events:list',
  EVENTS_HISTORY: 'events:history',
  EVENTS_STREAM: 'events:stream', // main → renderer push

  // Connector management
  CONNECTORS_LIST: 'connectors:list',
  CONNECTORS_STATUS: 'connectors:status',

  // Window management
  WINDOW_RESIZE: 'window:resize',
  WINDOW_MODE: 'window:mode',
  WINDOW_DOCK: 'window:dock',
  WINDOW_CLOSE: 'window:close',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_ALWAYS_ON_TOP: 'window:always-on-top',

  // Configuration
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  CONFIG_RELOAD: 'config:reload',
  CONFIG_CHANGED: 'config:changed', // main → renderer push

  // Network status
  NETWORK_STATUS: 'network:status',
  NETWORK_CHANGED: 'network:changed', // main → renderer push

  // Auth flows
  AUTH_START: 'auth:start',
  AUTH_STATUS: 'auth:status',
  AUTH_REVOKE: 'auth:revoke',

  // Actions
  ACTION_EXECUTE: 'action:execute',

  // App lifecycle
  APP_READY: 'app:ready',
  APP_FOCUS_TERMINAL: 'app:focus-terminal',
} as const;
