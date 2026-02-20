// ============================================================
// Daily Aggregate Rollup
// Pre-computes daily stats for trend charts
// ============================================================

import { eq, and, sql } from 'drizzle-orm';
import { dailyAggregates } from './schema';
import type { DB } from './connection';
import type { ConnectorEvent } from '@shared/types';

export class Aggregator {
  constructor(private db: DB) {}

  /** Convert timestamp to YYYYMMDD integer */
  private toDayKey(timestamp: number): number {
    const d = new Date(timestamp);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  /** Upsert aggregate row on each event insert */
  recordEvent(event: ConnectorEvent): void {
    const dayKey = this.toDayKey(event.timestamp);
    const category = event.category ?? 'uncategorized';
    const eventType = event.eventType ?? event.severity;
    const isSuccess = event.status === 'success';
    const isFailure = event.status === 'failure';

    // Try to find existing row
    const existing = this.db
      .select()
      .from(dailyAggregates)
      .where(
        and(
          eq(dailyAggregates.dayKey, dayKey),
          eq(dailyAggregates.connectorId, event.connectorId),
          eq(dailyAggregates.category, category),
          eq(dailyAggregates.eventType, eventType),
        ),
      )
      .get();

    if (existing) {
      const newTotal = (existing.totalCount ?? 0) + 1;
      const newSuccess = (existing.successCount ?? 0) + (isSuccess ? 1 : 0);
      const newFailure = (existing.failureCount ?? 0) + (isFailure ? 1 : 0);

      // Update running average for duration
      let newAvgDuration = existing.avgDurationMs;
      let newMaxDuration = existing.maxDurationMs;
      if (event.durationMs != null) {
        const prevTotal = existing.totalCount ?? 0;
        newAvgDuration = prevTotal > 0 && existing.avgDurationMs != null
          ? (existing.avgDurationMs * prevTotal + event.durationMs) / newTotal
          : event.durationMs;
        newMaxDuration = Math.max(existing.maxDurationMs ?? 0, event.durationMs);
      }

      this.db
        .update(dailyAggregates)
        .set({
          totalCount: newTotal,
          successCount: newSuccess,
          failureCount: newFailure,
          avgDurationMs: newAvgDuration,
          maxDurationMs: newMaxDuration,
        })
        .where(eq(dailyAggregates.id, existing.id))
        .run();
    } else {
      this.db.insert(dailyAggregates).values({
        dayKey,
        connectorId: event.connectorId,
        category,
        eventType,
        totalCount: 1,
        successCount: isSuccess ? 1 : 0,
        failureCount: isFailure ? 1 : 0,
        avgDurationMs: event.durationMs ?? null,
        maxDurationMs: event.durationMs ?? null,
      }).run();
    }
  }

  /** Get aggregates for a connector over a date range */
  getAggregates(
    connectorId: string,
    fromDayKey: number,
    toDayKey: number,
  ): (typeof dailyAggregates.$inferSelect)[] {
    return this.db
      .select()
      .from(dailyAggregates)
      .where(
        and(
          eq(dailyAggregates.connectorId, connectorId),
          sql`${dailyAggregates.dayKey} >= ${fromDayKey}`,
          sql`${dailyAggregates.dayKey} <= ${toDayKey}`,
        ),
      )
      .all();
  }

  /** Purge aggregates older than given day key */
  purgeOlderThan(dayKey: number): number {
    const result = this.db
      .delete(dailyAggregates)
      .where(sql`${dailyAggregates.dayKey} < ${dayKey}`)
      .run();
    return result.changes;
  }
}
