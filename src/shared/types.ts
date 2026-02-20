// ============================================================
// iDashboard - Shared Type Definitions
// Used by both main process and renderer process
// ============================================================

// --- Connector Types ---

export type AuthType = 'none' | 'apiKey' | 'basic' | 'bearer' | 'token';

export interface AuthConfig {
  type: AuthType;
  apiKey?: string;
  username?: string;
  password?: string;
  token?: string;
  headerName?: string; // custom header for API key auth
}

export interface WidgetTierConfig {
  showBadge?: boolean;
  blinkOnAttention?: boolean;
  showLastEvent?: boolean;
  maxTitleLength?: number;
  showActions?: boolean;
  showEventHistory?: number;
  showFullHistory?: boolean;
  showChart?: boolean;
  customComponent?: string | null;
}

export interface WidgetUIConfig {
  icon: string;
  color: string;
  priority?: number;
  tiers?: {
    micro?: WidgetTierConfig;
    compact?: WidgetTierConfig;
    standard?: WidgetTierConfig;
    expanded?: WidgetTierConfig;
  };
}

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
  metadata?: Record<string, unknown>;
  uiHints?: EventUIHints;
  ttl?: number; // milliseconds until auto-dismiss
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
}

export interface ConnectorAction {
  id: string;
  label: string;
  icon?: string;
  description?: string;
}

// --- UI / Layout Types ---

export type SizeTier = 'icon' | 'micro' | 'compact' | 'standard' | 'expanded';

export type WindowMode = 'floating' | 'docked' | 'tray' | 'fullscreen';

export type DockPosition = 'top' | 'bottom' | 'left' | 'right';

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

export interface AppConfig {
  app: {
    port: number;
    startMinimized: boolean;
    defaultWindowMode: WindowMode;
    defaultSize: WindowSize;
    alwaysOnTop: boolean;
    opacity: number;
    theme: 'dark' | 'light' | 'auto';
  };
  api: {
    bind: string;
    auth: {
      enabled: boolean;
      token?: string;
    };
  };
  events: {
    maxHistory: number;
    defaultTTL: number;
    attentionBlinkDefault: number;
  };
  notifications: {
    sound: boolean;
    soundFile?: string | null;
    nativeNotification: boolean;
  };
}

// --- IPC Types ---

export type IPCChannel =
  | 'events:push'
  | 'events:dismiss'
  | 'events:list'
  | 'connectors:status'
  | 'connectors:list'
  | 'window:resize'
  | 'window:mode'
  | 'config:get'
  | 'config:update';

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

export interface APIResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
