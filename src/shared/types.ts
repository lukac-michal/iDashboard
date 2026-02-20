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
    launchAtLogin: boolean;
    startMinimized: boolean;
    checkForUpdates: boolean;
  };
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
