// ============================================================
// iDashboard - Shared Type Definitions
// Used by both main process and renderer process
// ============================================================

// --- Authentication Types ---

export type AuthType =
  | 'none'
  | 'apiKey'
  | 'basic'
  | 'bearer'
  | 'pat'
  | 'oauth-device-flow'
  | 'oauth-authorization-code'
  | 'webhook-secret';

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  authorizeUrl?: string;
  tokenUrl?: string;
  deviceCodeUrl?: string;
}

export interface AuthConfig {
  type: AuthType;
  token?: string;
  username?: string;
  password?: string;
  secret?: string;
  headerName?: string;
  paramName?: string;
  oauth?: OAuthConfig;
}

// --- Widget / UI Types ---

export interface WidgetThresholds {
  showTitle: number;
  showBody: number;
  showActions: number;
  showActionLabels: number;
  showHistory: number;
  historyCount: number;
}

export interface WidgetUIConfig {
  icon: string;
  color: string;
  priority?: number;
  showBadge?: boolean;
  blinkOnAttention?: boolean;
  thresholds?: Partial<WidgetThresholds>;
  customComponent?: string | null;
}

// --- Connector Types ---

export interface ConnectorConfig {
  id: string;
  type: string;
  displayName: string;
  enabled: boolean;
  pollIntervalMs: number;
  auth: AuthConfig;
  settings: Record<string, unknown>;
  ui: WidgetUIConfig;
}

export type ConnectorCapability = 'pull' | 'push' | 'action';

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical' | 'attention';

export interface ActionButton {
  id: string;
  label: string;
  icon?: string;
  variant?: 'default' | 'primary' | 'danger';
}

export interface EventUIHints {
  icon?: string;
  color?: string;
  blinkDurationMs?: number;
  actionButtons?: ActionButton[];
  badge?: string | number;
}

export interface ConnectorEvent {
  id: string;
  connectorId: string;
  timestamp: number;
  severity: EventSeverity;
  title: string;
  body?: string;
  category?: string;
  eventType?: string;
  status?: string;
  durationMs?: number;
  sourceUrl?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  uiHints?: EventUIHints;
  ttl?: number;
  dismissed?: boolean;
}

export interface ConnectorStatus {
  id: string;
  type: string;
  displayName: string;
  enabled: boolean;
  connected: boolean;
  lastPollAt?: number;
  lastError?: string;
  eventCount: number;
  health?: ConnectorHealth;
}

export interface ConnectorAction {
  id: string;
  label: string;
  icon?: string;
  description?: string;
}

// --- Network Reachability Types ---

export type ReachabilityState =
  | 'online'
  | 'degraded'
  | 'vpn-disconnected'
  | 'offline';

export type EndpointReachability =
  | 'reachable'
  | 'dns-failed'
  | 'tcp-failed'
  | 'http-failed'
  | 'auth-failed'
  | 'unknown';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface ConnectorHealth {
  reachability: EndpointReachability;
  circuitState: CircuitState;
  consecutiveFailures: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
  currentBackoffMs: number;
  nextPollAt?: number;
  latencyMs?: number;
  requiresVpn: boolean;
}

// --- UI / Layout Types ---

export type SizeTier = 'icon' | 'micro' | 'compact' | 'standard' | 'expanded';

export type WindowMode = 'floating' | 'docked' | 'tray' | 'fullscreen';

export type DockPosition =
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WindowSize {
  width: number;
  height: number;
}

export interface LayoutConfig {
  mode: WindowMode;
  size: WindowSize;
  position?: { x: number; y: number };
  dockPosition?: DockPosition;
  alwaysOnTop: boolean;
  opacity: number;
}

// --- Configuration Types ---

export interface WindowConfig {
  uiStyle: 'normal' | 'minimal';
  defaultMode: WindowMode;
  size: {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    rememberLastSize: boolean;
  };
  position: {
    x: number | null;
    y: number | null;
    rememberLastPosition: boolean;
  };
  opacity: number;
  frameless: boolean;
  clickThrough: boolean;
  theme: 'dark' | 'light' | 'auto';
  dock: {
    position: DockPosition | null;
    offsetX: number;
    offsetY: number;
    autoHide: boolean;
    autoHideDelayMs: number;
    showOnHover: boolean;
  };
  alwaysOnTop: {
    permanent: boolean;
    onNotification: {
      enabled: boolean;
      durationSec: number;
      flashCount: number;
      flashIntervalMs: number;
      afterExpiry: 'hide' | 'lower' | 'minimize' | 'stay';
      cancelOnInteraction: boolean;
    };
  };
}

export interface AppConfig {
  window: WindowConfig;
  api: {
    port: number;
    bind: string;
    auth: {
      enabled: boolean;
      token?: string;
    };
    rateLimit: {
      maxRequestsPerMinute: number;
      maxBurstSize: number;
    };
  };
  events: {
    maxHistory: number;
    defaultTTLMs: number;
    deduplication: {
      enabled: boolean;
      windowMs: number;
    };
  };
  notifications: {
    sound: {
      enabled: boolean;
      file: string | null;
      volume: number;
    };
    nativeNotification: boolean;
    trayIconBadge: boolean;
    popupMinSeverity: EventSeverity;
    blinkMinSeverity: EventSeverity;
  };
  storage: {
    retentionDays: number;
    aggregateRetentionDays: number;
    vacuumIntervalHours: number;
    maxDbSizeMB: number;
  };
  network: {
    vpnInterfaceCheckIntervalSec: number;
    dnsCheckTimeoutMs: number;
    circuitBreaker: {
      failureThreshold: number;
      halfOpenRetryMs: number;
      maxBackoffMs: number;
      backoffJitter: number;
    };
  };
  startup: {
    appMode: 'dock' | 'menubar';
    launchAtLogin: boolean;
    startMinimized: boolean;
    checkForUpdates: boolean;
  };
  debug: {
    enabled: boolean;
  };
  experimental: {
    enabled: boolean;
    prompt: string;
    pmProfile: string;
    repoPath: string;
    agentProfilesDir: string;
    healthCheckIntervalMs: number;
  };
  slackBridge: {
    enabled: boolean;
    targetChannel: string;
    forwardStop: boolean;
    forwardSubagentStop: boolean;
    forwardTaskComplete: boolean;
    forwardToolUse: boolean;
    forwardNeedsInput: boolean;
    forwardUserPrompt: boolean;
    forwardStopMessages?: boolean; // LEGACY — migration only
    threadingMode: 'continuous' | 'per-interaction';
    maxThreadMessages: number;
    reverseEnabled: boolean;
    maxMessageLength: number;
  };
}

// --- Agent Orchestration Types ---

export type AgentStatus = 'online' | 'busy' | 'idle' | 'offline' | 'stale';

export type AgentReportStatus = 'working' | 'done' | 'question' | 'blocked' | 'error';

export interface AgentReportRequest {
  agentName: string;
  status: AgentReportStatus;
  shortSummary: string;
  longSummary?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  status: AgentStatus;
  profilePath?: string;
  sessionName?: string;
  registeredAt: number;
  lastSeenAt: number;
  reportStatus?: AgentReportStatus;
  shortSummary?: string;
  lastReportAt?: number;
}

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
}

// --- Slack Chat Types ---

export interface SlackChatMessage {
  id: string;
  channel: string;
  text: string;
  timestamp: number;
  direction: 'sent' | 'received';
  user?: string;
  threadTs?: string;
  slackTs?: string;
  eventType?: string;
  status?: 'sending' | 'sent' | 'failed';
  error?: string;
}

// --- IPC Types ---

export type IPCChannel =
  | 'events:push'
  | 'events:dismiss'
  | 'events:list'
  | 'events:history'
  | 'connectors:status'
  | 'connectors:list'
  | 'window:resize'
  | 'window:mode'
  | 'window:dock'
  | 'config:get'
  | 'config:update'
  | 'config:reload'
  | 'network:status'
  | 'auth:start'
  | 'auth:status'
  | 'action:execute';

// --- Grid Layout Types ---

export interface GridLayoutItem {
  i: string; // connector ID
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface SavedLayout {
  name: string;
  items: GridLayoutItem[];
  columns: number;
  updatedAt: number;
}

// --- Theme Types ---

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceHover: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
}

export interface CustomTheme {
  name: string;
  colors: ThemeColors;
}

// --- Cross-Connector Rule Types ---

export type RuleOperator = 'equals' | 'contains' | 'matches' | 'gt' | 'lt';

export interface RuleCondition {
  field: 'severity' | 'title' | 'body' | 'category' | 'eventType' | 'connectorId' | 'status';
  operator: RuleOperator;
  value: string;
}

export type RuleActionType = 'escalate' | 'suppress' | 'tag' | 'notify' | 'group';

export interface RuleAction {
  type: RuleActionType;
  params: Record<string, unknown>;
}

export interface CrossConnectorRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  matchMode: 'all' | 'any';
  actions: RuleAction[];
  priority: number;
}

// --- Keyboard Shortcut Types ---

export interface KeyboardShortcut {
  id: string;
  keys: string; // e.g., "Ctrl+Shift+D"
  action: string;
  description: string;
  scope: 'global' | 'app';
}

// --- Data Export Types ---

export type ExportFormat = 'csv' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  connectorIds?: string[];
  fromTimestamp?: number;
  toTimestamp?: number;
  includeMetadata?: boolean;
  maxRows?: number;
}

// --- Aggregate Query Types ---

export interface AggregateQuery {
  connectorId?: string;
  fromDayKey: number;
  toDayKey: number;
}

export interface AggregateResult {
  dayKey: number;
  connectorId: string;
  category: string;
  eventType: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  maxDurationMs: number | null;
}

// --- Settings Panel Types ---

export type SettingsTab = 'general' | 'connectors' | 'appearance' | 'notifications' | 'network' | 'shortcuts' | 'rules' | 'debug' | 'experimental' | 'about';

// --- API Types ---

export interface PushEventRequest {
  connector: string;
  event?: string;
  title?: string;
  body?: string;
  severity?: EventSeverity;
  session?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  uiHints?: EventUIHints;
}

export interface ProfileOption {
  name: string;
  path: string;
}

export interface WebhookPayload {
  headers: Record<string, string>;
  body: unknown;
  source: string;
}

export interface APIResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
