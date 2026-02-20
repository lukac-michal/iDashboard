// ============================================================
// Database Maintenance
// Retention purge, VACUUM scheduling
// ============================================================

import type Database from 'better-sqlite3';
import type { EventStore } from './event-store';
import type { Aggregator } from './aggregator';

export class DatabaseMaintenance {
  private retentionTimer?: ReturnType<typeof setInterval>;
  private vacuumTimer?: ReturnType<typeof setInterval>;

  constructor(
    private sqlite: Database.Database,
    private eventStore: EventStore,
    private aggregator: Aggregator,
    private retentionDays: number,
    private aggregateRetentionDays: number,
    private vacuumIntervalHours: number,
  ) {}

  start(): void {
    // Run immediately on startup
    this.runRetention();

    // Schedule daily retention
    this.retentionTimer = setInterval(() => {
      this.runRetention();
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Schedule vacuum
    if (this.vacuumIntervalHours > 0) {
      this.vacuumTimer = setInterval(() => {
        this.runVacuum();
      }, this.vacuumIntervalHours * 60 * 60 * 1000);
    }
  }

  stop(): void {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    if (this.vacuumTimer) clearInterval(this.vacuumTimer);
  }

  runRetention(): void {
    const now = Date.now();

    // Purge expired events
    const expired = this.eventStore.purgeExpired();
    if (expired > 0) {
      console.log(`[Maintenance] Purged ${expired} expired events`);
    }

    // Purge old events
    const cutoff = now - this.retentionDays * 24 * 60 * 60 * 1000;
    const old = this.eventStore.purgeOlderThan(cutoff);
    if (old > 0) {
      console.log(`[Maintenance] Purged ${old} events older than ${this.retentionDays} days`);
    }

    // Purge old aggregates
    const aggCutoff = new Date(now - this.aggregateRetentionDays * 24 * 60 * 60 * 1000);
    const aggDayKey = aggCutoff.getFullYear() * 10000
      + (aggCutoff.getMonth() + 1) * 100
      + aggCutoff.getDate();
    const aggPurged = this.aggregator.purgeOlderThan(aggDayKey);
    if (aggPurged > 0) {
      console.log(`[Maintenance] Purged ${aggPurged} aggregates older than ${this.aggregateRetentionDays} days`);
    }
  }

  runVacuum(): void {
    try {
      this.sqlite.exec('VACUUM');
      console.log('[Maintenance] VACUUM completed');
    } catch (err) {
      console.error('[Maintenance] VACUUM failed:', err);
    }
  }

  getDatabaseSizeMB(): number {
    const row = this.sqlite.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get() as { size: number } | undefined;
    return (row?.size ?? 0) / (1024 * 1024);
  }
}
