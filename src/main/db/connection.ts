// ============================================================
// Database Connection
// SQLite setup with WAL mode and performance pragmas
// ============================================================

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;

export function createDatabase(dbPath: string): { db: DB; sqlite: Database.Database } {
  const sqlite = new Database(dbPath);

  // Performance pragmas
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('cache_size = -64000');    // 64MB
  sqlite.pragma('mmap_size = 268435456');  // 256MB
  sqlite.pragma('foreign_keys = ON');

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      timestamp INTEGER NOT NULL,
      connector_id TEXT NOT NULL,
      category TEXT,
      event_type TEXT,
      severity TEXT NOT NULL,
      status TEXT,
      duration_ms INTEGER,
      title TEXT NOT NULL,
      body TEXT,
      metadata TEXT,
      source_url TEXT,
      external_id TEXT,
      dismissed INTEGER DEFAULT 0,
      expires_at INTEGER,
      ui_hints TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_connector_time ON events(connector_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_severity_time ON events(severity, timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_category_status_time ON events(category, status, timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_external_id ON events(external_id);
    CREATE INDEX IF NOT EXISTS idx_events_expires_at ON events(expires_at);

    CREATE TABLE IF NOT EXISTS connector_state (
      connector_id TEXT PRIMARY KEY,
      last_poll_at INTEGER,
      last_event_at INTEGER,
      error_count INTEGER DEFAULT 0,
      last_error TEXT,
      health_status TEXT DEFAULT 'healthy',
      circuit_state TEXT DEFAULT 'closed',
      backoff_ms INTEGER DEFAULT 0,
      poll_state TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS daily_aggregates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_key INTEGER NOT NULL,
      connector_id TEXT NOT NULL,
      category TEXT NOT NULL,
      event_type TEXT NOT NULL,
      total_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      avg_duration_ms REAL,
      p95_duration_ms REAL,
      max_duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_daily_agg_connector_day ON daily_aggregates(connector_id, day_key);
    CREATE INDEX IF NOT EXISTS idx_daily_agg_category_type_day ON daily_aggregates(category, event_type, day_key);

    CREATE TABLE IF NOT EXISTS kv_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER
    );
  `);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
