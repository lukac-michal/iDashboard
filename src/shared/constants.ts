// ============================================================
// iDashboard - Shared Constants
// ============================================================

export const DEFAULT_PORT = 19280;
export const DEFAULT_BIND = '127.0.0.1';

export const DEFAULT_EVENT_TTL = 3_600_000; // 1 hour
export const DEFAULT_BLINK_DURATION = 30_000; // 30 seconds
export const DEFAULT_MAX_HISTORY = 1000;

export const SIZE_TIER_THRESHOLDS = {
  icon: 30_000,      // area < 30k px² (~170x170)
  micro: 80_000,     // area < 80k px² (~280x280)
  compact: 200_000,  // area < 200k px² (~450x450)
  standard: 500_000, // area < 500k px² (~700x700)
  // everything above = expanded
} as const;

export const CONNECTOR_TYPES = {
  CLAUDE_CODE: 'claude-code',
  OCTOPUS_DEPLOY: 'octopus-deploy',
  TEAMCITY: 'teamcity',
  GRAYLOG: 'graylog',
  GENERIC_HTTP: 'generic-http',
  GENERIC_PUSH: 'generic-push',
} as const;

export const API_PREFIX = '/api/v1';
