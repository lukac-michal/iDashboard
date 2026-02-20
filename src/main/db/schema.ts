// ============================================================
// Database Schema - Drizzle ORM definitions for SQLite
// ============================================================

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// --- Core Event Store ---
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: text('event_id').notNull().unique(),
  timestamp: integer('timestamp').notNull(),
  connectorId: text('connector_id').notNull(),
  category: text('category'),
  eventType: text('event_type'),
  severity: text('severity').notNull(),
  status: text('status'),
  durationMs: integer('duration_ms'),
  title: text('title').notNull(),
  body: text('body'),
  metadata: text('metadata', { mode: 'json' }),
  sourceUrl: text('source_url'),
  externalId: text('external_id'),
  dismissed: integer('dismissed', { mode: 'boolean' }).default(false),
  expiresAt: integer('expires_at'),
  uiHints: text('ui_hints', { mode: 'json' }),
}, (table) => [
  index('idx_events_connector_time').on(table.connectorId, table.timestamp),
  index('idx_events_severity_time').on(table.severity, table.timestamp),
  index('idx_events_category_status_time').on(table.category, table.status, table.timestamp),
  index('idx_events_external_id').on(table.externalId),
  index('idx_events_expires_at').on(table.expiresAt),
]);

// --- Connector State ---
export const connectorState = sqliteTable('connector_state', {
  connectorId: text('connector_id').primaryKey(),
  lastPollAt: integer('last_poll_at'),
  lastEventAt: integer('last_event_at'),
  errorCount: integer('error_count').default(0),
  lastError: text('last_error'),
  healthStatus: text('health_status').default('healthy'),
  circuitState: text('circuit_state').default('closed'),
  backoffMs: integer('backoff_ms').default(0),
  pollState: text('poll_state', { mode: 'json' }),
  updatedAt: integer('updated_at'),
});

// --- Daily Aggregates ---
export const dailyAggregates = sqliteTable('daily_aggregates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dayKey: integer('day_key').notNull(),
  connectorId: text('connector_id').notNull(),
  category: text('category').notNull(),
  eventType: text('event_type').notNull(),
  totalCount: integer('total_count').default(0),
  successCount: integer('success_count').default(0),
  failureCount: integer('failure_count').default(0),
  avgDurationMs: real('avg_duration_ms'),
  p95DurationMs: real('p95_duration_ms'),
  maxDurationMs: integer('max_duration_ms'),
}, (table) => [
  index('idx_daily_agg_connector_day').on(table.connectorId, table.dayKey),
  index('idx_daily_agg_category_type_day').on(table.category, table.eventType, table.dayKey),
]);

// --- Key-Value Cache ---
export const kvCache = sqliteTable('kv_cache', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
  expiresAt: integer('expires_at'),
});
