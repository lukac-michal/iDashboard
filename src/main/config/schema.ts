// ============================================================
// Configuration Schema - Zod validation for all config files
// ============================================================

import { z } from 'zod';

// --- Auth Schema ---

const oauthConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()).default([]),
  authorizeUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional(),
  deviceCodeUrl: z.string().url().optional(),
});

const authConfigSchema = z.object({
  type: z.enum([
    'none', 'apiKey', 'basic', 'bearer', 'pat',
    'oauth-device-flow', 'oauth-authorization-code', 'webhook-secret',
  ]).default('none'),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  secret: z.string().optional(),
  headerName: z.string().optional(),
  paramName: z.string().optional(),
  oauth: oauthConfigSchema.optional(),
});

// --- Widget UI Schema ---

const widgetUISchema = z.object({
  icon: z.string().default('box'),
  color: z.string().default('#6366f1'),
  priority: z.number().int().default(10),
  showBadge: z.boolean().default(true),
  blinkOnAttention: z.boolean().default(true),
  thresholds: z.object({
    showTitle: z.number().default(150),
    showBody: z.number().default(300),
    showActions: z.number().default(250),
    showActionLabels: z.number().default(350),
    showHistory: z.number().default(400),
    historyCount: z.number().default(5),
  }).partial().optional(),
  customComponent: z.string().nullable().optional(),
});

// --- Connector Config Schema ---

export const connectorConfigSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean().default(true),
  pollIntervalMs: z.number().int().min(0).default(30_000),
  auth: authConfigSchema.default({ type: 'none' }),
  settings: z.record(z.unknown()).default({}),
  ui: widgetUISchema.default({ icon: 'box', color: '#6366f1' }),
});

// --- Main App Config Schema ---

export const appConfigSchema = z.object({
  window: z.object({
    uiStyle: z.enum(['normal', 'minimal']).default('normal'),
    defaultMode: z.enum(['floating', 'docked', 'tray', 'fullscreen']).default('floating'),
    size: z.object({
      width: z.number().int().positive().default(650),
      height: z.number().int().positive().default(480),
      minWidth: z.number().int().positive().default(200),
      minHeight: z.number().int().positive().default(150),
      rememberLastSize: z.boolean().default(true),
    }).default({}),
    position: z.object({
      x: z.number().int().nullable().default(null),
      y: z.number().int().nullable().default(null),
      rememberLastPosition: z.boolean().default(true),
    }).default({}),
    opacity: z.number().min(0).max(1).default(0.95),
    frameless: z.boolean().default(true),
    clickThrough: z.boolean().default(false),
    theme: z.enum(['dark', 'light', 'auto']).default('dark'),
    dock: z.object({
      position: z.enum([
        'top', 'bottom', 'left', 'right',
        'top-left', 'top-right', 'bottom-left', 'bottom-right',
      ]).nullable().default(null),
      offsetX: z.number().default(0),
      offsetY: z.number().default(0),
      autoHide: z.boolean().default(false),
      autoHideDelayMs: z.number().int().min(0).default(5000),
      showOnHover: z.boolean().default(true),
    }).default({}),
    alwaysOnTop: z.object({
      permanent: z.boolean().default(false),
      onNotification: z.object({
        enabled: z.boolean().default(true),
        durationSec: z.number().positive().default(30),
        flashCount: z.number().int().min(0).default(3),
        flashIntervalMs: z.number().int().positive().default(500),
        afterExpiry: z.enum(['hide', 'lower', 'minimize', 'stay']).default('hide'),
        cancelOnInteraction: z.boolean().default(true),
      }).default({}),
    }).default({}),
  }).default({}),
  api: z.object({
    port: z.number().int().min(1).max(65535).default(19280),
    bind: z.string().default('127.0.0.1'),
    auth: z.object({
      enabled: z.boolean().default(false),
      token: z.string().optional(),
    }).default({}),
    rateLimit: z.object({
      maxRequestsPerMinute: z.number().int().positive().default(120),
      maxBurstSize: z.number().int().positive().default(20),
    }).default({}),
  }).default({}),
  events: z.object({
    maxHistory: z.number().int().positive().default(1000),
    defaultTTLMs: z.number().int().positive().default(3_600_000),
    deduplication: z.object({
      enabled: z.boolean().default(true),
      windowMs: z.number().int().positive().default(5000),
    }).default({}),
  }).default({}),
  notifications: z.object({
    sound: z.object({
      enabled: z.boolean().default(true),
      file: z.string().nullable().default(null),
      volume: z.number().min(0).max(1).default(0.7),
    }).default({}),
    nativeNotification: z.boolean().default(true),
    trayIconBadge: z.boolean().default(true),
    popupMinSeverity: z.enum(['info', 'warning', 'error', 'critical', 'attention']).default('info'),
    blinkMinSeverity: z.enum(['info', 'warning', 'error', 'critical', 'attention']).default('info'),
  }).default({}),
  storage: z.object({
    retentionDays: z.number().int().positive().default(30),
    aggregateRetentionDays: z.number().int().positive().default(90),
    vacuumIntervalHours: z.number().int().min(0).default(168),
    maxDbSizeMB: z.number().int().positive().default(1024),
  }).default({}),
  network: z.object({
    vpnInterfaceCheckIntervalSec: z.number().int().positive().default(30),
    dnsCheckTimeoutMs: z.number().int().positive().default(3000),
    circuitBreaker: z.object({
      failureThreshold: z.number().int().positive().default(5),
      halfOpenRetryMs: z.number().int().positive().default(30_000),
      maxBackoffMs: z.number().int().positive().default(300_000),
      backoffJitter: z.number().min(0).max(1).default(0.3),
    }).default({}),
  }).default({}),
  startup: z.object({
    appMode: z.enum(['dock', 'menubar']).default('dock'),
    launchAtLogin: z.boolean().default(false),
    startMinimized: z.boolean().default(true),
    checkForUpdates: z.boolean().default(true),
  }).default({}),
  debug: z.object({
    enabled: z.boolean().default(false),
  }).default({}),
});

export type ValidatedAppConfig = z.infer<typeof appConfigSchema>;
export type ValidatedConnectorConfig = z.infer<typeof connectorConfigSchema>;
