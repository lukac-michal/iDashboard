// ============================================================
// iDashboard - Shared Constants
// ============================================================

// Severity levels ordered from lowest to highest
export const SEVERITY_ORDER: Record<string, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
  attention: 4,
};

export function meetsMinSeverity(severity: string, minSeverity: string): boolean {
  return (SEVERITY_ORDER[severity] ?? 0) >= (SEVERITY_ORDER[minSeverity] ?? 0);
}

export const DEFAULT_PORT = 19280;
export const DEFAULT_BIND = '127.0.0.1';

export const DEFAULT_EVENT_TTL = 3_600_000; // 1 hour
export const DEFAULT_BLINK_DURATION = 30_000; // 30 seconds
export const DEFAULT_MAX_HISTORY = 1000;

// Fluid widget sizing thresholds (container width in px)
export const WIDGET_THRESHOLDS = {
  showTitle: 150,
  showBody: 300,
  showActions: 250,
  showActionLabels: 350,
  showHistory: 400,
  historyCount: 5,
} as const;

// Layout column calculation: 1 column per 280px of width
export const COLUMN_WIDTH_UNIT = 280;

export const CONNECTOR_TYPES = {
  CLAUDE_CODE: 'claude-code',
  CURSOR: 'cursor',
  OCTOPUS_DEPLOY: 'octopus-deploy',
  TEAMCITY: 'teamcity',
  GRAYLOG: 'graylog',
  GITHUB: 'github',
  SLACK: 'slack',
  GENERIC_HTTP: 'generic-http',
  GENERIC_PUSH: 'generic-push',
  WEBHOOK: 'webhook',
} as const;

export const API_PREFIX = '/api/v1';

// Circuit breaker defaults
export const CIRCUIT_BREAKER_DEFAULTS = {
  failureThreshold: 5,
  halfOpenRetryMs: 30_000,
  maxBackoffMs: 300_000, // 5 minutes
  backoffJitter: 0.3,
  initialBackoffMs: 5_000,
} as const;

// Network reachability
export const VPN_INTERFACE_PATTERNS = /^(utun|tun|ppp|ipsec|tap)\d*$/;
export const VPN_CHECK_INTERVAL_MS = 30_000;
export const DNS_CHECK_TIMEOUT_MS = 3_000;

// Storage defaults
export const STORAGE_DEFAULTS = {
  retentionDays: 30,
  aggregateRetentionDays: 90,
  vacuumIntervalHours: 168, // weekly
  maxDbSizeMB: 1024,
} as const;

// Webhook sources with built-in parsers
export const WEBHOOK_SOURCES = ['github', 'gitlab', 'bitbucket', 'pagerduty', 'generic'] as const;
export type WebhookSource = (typeof WEBHOOK_SOURCES)[number];
