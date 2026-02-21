// ============================================================
// Configuration Defaults
// Every config key has a sensible default - zero config required
// ============================================================

import type { AppConfig } from '@shared/types';

export const DEFAULT_CONFIG: AppConfig = {
  window: {
    defaultMode: 'floating',
    size: {
      width: 400,
      height: 300,
      minWidth: 80,
      minHeight: 60,
      rememberLastSize: true,
    },
    position: {
      x: null,
      y: null,
      rememberLastPosition: true,
    },
    opacity: 0.95,
    frameless: true,
    clickThrough: false,
    theme: 'dark',
    dock: {
      position: null,
      offsetX: 0,
      offsetY: 0,
      autoHide: false,
      autoHideDelayMs: 5000,
      showOnHover: true,
    },
    alwaysOnTop: {
      permanent: false,
      onNotification: {
        enabled: true,
        durationSec: 30,
        flashCount: 3,
        flashIntervalMs: 500,
        afterExpiry: 'hide',
        cancelOnInteraction: true,
      },
    },
  },
  api: {
    port: 19280,
    bind: '127.0.0.1',
    auth: {
      enabled: false,
    },
    rateLimit: {
      maxRequestsPerMinute: 120,
      maxBurstSize: 20,
    },
  },
  events: {
    maxHistory: 1000,
    defaultTTLMs: 3_600_000,
    deduplication: {
      enabled: true,
      windowMs: 5000,
    },
  },
  notifications: {
    sound: {
      enabled: true,
      file: null,
      volume: 0.7,
    },
    nativeNotification: true,
    trayIconBadge: true,
    popupMinSeverity: 'info' as const,
    blinkMinSeverity: 'info' as const,
  },
  storage: {
    retentionDays: 30,
    aggregateRetentionDays: 90,
    vacuumIntervalHours: 168,
    maxDbSizeMB: 1024,
  },
  network: {
    vpnInterfaceCheckIntervalSec: 30,
    dnsCheckTimeoutMs: 3000,
    circuitBreaker: {
      failureThreshold: 5,
      halfOpenRetryMs: 30_000,
      maxBackoffMs: 300_000,
      backoffJitter: 0.3,
    },
  },
  startup: {
    launchAtLogin: false,
    startMinimized: true,
    checkForUpdates: true,
  },
};
