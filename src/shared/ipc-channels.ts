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
  CONNECTORS_GET_CONFIG: 'connectors:get-config',

  // Connector health details
  CONNECTOR_HEALTH_ALL: 'connector:health-all',

  // Logs
  LOGS_GET: 'logs:get',

  // Agent orchestration
  AGENTS_LIST: 'agents:list',
  AGENTS_REGISTER: 'agents:register',
  AGENTS_UNREGISTER: 'agents:unregister',
  AGENTS_UPDATE_STATUS: 'agents:update-status',
  AGENTS_STREAM: 'agents:stream',               // main → renderer push
  AGENT_MESSAGES_LIST: 'agent-messages:list',
  AGENT_MESSAGES_STREAM: 'agent-messages:stream', // main → renderer push
  AGENT_SPAWN: 'agent:spawn',
  AGENT_SEND_TEXT: 'agent:send-text',
  AGENT_FOCUS: 'agent:focus',
  AGENT_TERMINATE: 'agent:terminate',

  // Master agent
  MASTER_ROUTE_TASK: 'master:route-task',
  MASTER_MESSAGES: 'master:messages',

  // Connector force poll
  CONNECTORS_FORCE_POLL: 'connectors:force-poll',

  // Slack bidirectional
  SLACK_SEND: 'slack:send',
  SLACK_CHANNELS: 'slack:channels',

  // Slack Bridge
  SLACK_BRIDGE_INSTALL_HOOKS: 'slack-bridge:install-hooks',

  // Profiles
  PROFILES_LIST: 'profiles:list',

  // App lifecycle
  APP_READY: 'app:ready',
  APP_FOCUS_TERMINAL: 'app:focus-terminal',
  APP_NAVIGATE: 'app:navigate', // main → renderer: switch active panel
} as const;
