// ============================================================
// Event Store - Insert, query, dismiss, purge events
// ============================================================

import { eq, and, gte, lte, desc, sql, lt } from 'drizzle-orm';
import { events } from './schema';
import type { DB } from './connection';
import type { ConnectorEvent } from '@shared/types';

export class EventStore {
  constructor(private db: DB) {}

  insert(event: ConnectorEvent): void {
    const expiresAt = event.ttl ? event.timestamp + event.ttl : null;

    this.db.insert(events).values({
      eventId: event.id,
      timestamp: event.timestamp,
      connectorId: event.connectorId,
      category: event.category ?? null,
      eventType: event.eventType ?? null,
      severity: event.severity,
      status: event.status ?? null,
      durationMs: event.durationMs ?? null,
      title: event.title,
      body: event.body ?? null,
      metadata: event.metadata ?? null,
      sourceUrl: event.sourceUrl ?? null,
      externalId: event.externalId ?? null,
      dismissed: event.dismissed ?? false,
      expiresAt,
      uiHints: event.uiHints ?? null,
    }).run();
  }

  getRecent(limit: number = 100, sinceTimestamp?: number): ConnectorEvent[] {
    let query = this.db
      .select()
      .from(events)
      .orderBy(desc(events.timestamp))
      .limit(limit);

    if (sinceTimestamp) {
      query = query.where(gte(events.timestamp, sinceTimestamp)) as typeof query;
    }

    return query.all().map(this.rowToEvent);
  }

  getByConnector(connectorId: string, limit: number = 50): ConnectorEvent[] {
    return this.db
      .select()
      .from(events)
      .where(eq(events.connectorId, connectorId))
      .orderBy(desc(events.timestamp))
      .limit(limit)
      .all()
      .map(this.rowToEvent);
  }

  getActive(): ConnectorEvent[] {
    const now = Date.now();
    return this.db
      .select()
      .from(events)
      .where(
        and(
          eq(events.dismissed, false),
          sql`(${events.expiresAt} IS NULL OR ${events.expiresAt} > ${now})`,
        ),
      )
      .orderBy(desc(events.timestamp))
      .all()
      .map(this.rowToEvent);
  }

  dismiss(eventId: string): boolean {
    const result = this.db
      .update(events)
      .set({ dismissed: true })
      .where(eq(events.eventId, eventId))
      .run();
    return result.changes > 0;
  }

  findByExternalId(externalId: string, connectorId: string): ConnectorEvent | null {
    const row = this.db
      .select()
      .from(events)
      .where(and(eq(events.externalId, externalId), eq(events.connectorId, connectorId)))
      .limit(1)
      .get();

    return row ? this.rowToEvent(row) : null;
  }

  isDuplicate(connectorId: string, title: string, windowMs: number): boolean {
    const since = Date.now() - windowMs;
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(
        and(
          eq(events.connectorId, connectorId),
          eq(events.title, title),
          gte(events.timestamp, since),
        ),
      )
      .get();
    return (row?.count ?? 0) > 0;
  }

  purgeExpired(): number {
    const now = Date.now();
    const result = this.db
      .delete(events)
      .where(
        and(
          sql`${events.expiresAt} IS NOT NULL`,
          lte(events.expiresAt, now),
        ),
      )
      .run();
    return result.changes;
  }

  purgeOlderThan(timestamp: number): number {
    const result = this.db
      .delete(events)
      .where(lt(events.timestamp, timestamp))
      .run();
    return result.changes;
  }

  count(): number {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .get();
    return row?.count ?? 0;
  }

  private rowToEvent(row: typeof events.$inferSelect): ConnectorEvent {
    return {
      id: row.eventId,
      connectorId: row.connectorId,
      timestamp: row.timestamp,
      severity: row.severity as ConnectorEvent['severity'],
      title: row.title,
      body: row.body ?? undefined,
      category: row.category ?? undefined,
      eventType: row.eventType ?? undefined,
      status: row.status ?? undefined,
      durationMs: row.durationMs ?? undefined,
      sourceUrl: row.sourceUrl ?? undefined,
      externalId: row.externalId ?? undefined,
      metadata: (row.metadata as Record<string, unknown>) ?? undefined,
      uiHints: (row.uiHints as ConnectorEvent['uiHints']) ?? undefined,
      dismissed: row.dismissed ?? false,
    };
  }
}
