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

  // Layout persistence
  LAYOUT_SAVE: 'layout:save',
  LAYOUT_LOAD: 'layout:load',
  LAYOUT_LIST: 'layout:list',

  // Theme
  THEME_SET: 'theme:set',
  THEME_GET_CUSTOM: 'theme:get-custom',

  // Aggregates
  AGGREGATES_QUERY: 'aggregates:query',

  // Data export
  EXPORT_EVENTS: 'export:events',

  // Sound
  SOUND_TEST: 'sound:test',

  // Rules
  RULES_LIST: 'rules:list',
  RULES_SAVE: 'rules:save',

  // Settings / config update
  CONFIG_UPDATE_PARTIAL: 'config:update-partial',
  CONNECTORS_UPDATE: 'connectors:update',
  CONNECTORS_ADD: 'connectors:add',
  CONNECTORS_REMOVE: 'connectors:remove',

  // Connector health details
  CONNECTOR_HEALTH_ALL: 'connector:health-all',

  // Logs
  LOGS_GET: 'logs:get',

  // App lifecycle
  APP_READY: 'app:ready',
  APP_FOCUS_TERMINAL: 'app:focus-terminal',
  APP_NAVIGATE: 'app:navigate', // main → renderer: switch active panel
} as const;
