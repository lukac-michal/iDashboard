// ============================================================
// Health & Diagnostics Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';

// Track request stats in-memory
const stats = {
  startedAt: Date.now(),
  eventsReceived: 0,
  lastEventAt: null as number | null,
  lastEventTitle: null as string | null,
  lastEventConnector: null as string | null,
  errors: [] as { time: number; message: string }[],
};

export function recordEventReceived(connectorId: string, title: string): void {
  stats.eventsReceived++;
  stats.lastEventAt = Date.now();
  stats.lastEventTitle = title;
  stats.lastEventConnector = connectorId;
}

export function recordError(message: string): void {
  stats.errors.push({ time: Date.now(), message });
  // Keep only last 20 errors
  if (stats.errors.length > 20) stats.errors.shift();
}

export function registerHealthRoutes(server: FastifyInstance, ctx: APIContext): void {
  // Basic health check
  server.get(`${API_PREFIX}/health`, async (_request, reply) => {
    const statuses = ctx.engine.getStatuses();
    const healthy = statuses.filter(s => s.connected).length;
    const total = statuses.length;

    return reply.send({
      ok: true,
      data: {
        status: healthy === total ? 'healthy' : healthy > 0 ? 'degraded' : 'unhealthy',
        connectors: { healthy, total },
        events: { total: ctx.eventStore.count() },
        uptime: process.uptime(),
      },
    });
  });

  // Detailed diagnostics
  server.get(`${API_PREFIX}/diagnostics`, async (_request, reply) => {
    const statuses = ctx.engine.getStatuses();
    const recentEvents = ctx.eventStore.getRecent(10);
    const activeEvents = ctx.eventStore.getActive();

    return reply.send({
      ok: true,
      data: {
        server: {
          uptime: process.uptime(),
          startedAt: new Date(stats.startedAt).toISOString(),
          pid: process.pid,
          memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
        api: {
          eventsReceived: stats.eventsReceived,
          lastEventAt: stats.lastEventAt ? new Date(stats.lastEventAt).toISOString() : null,
          lastEventTitle: stats.lastEventTitle,
          lastEventConnector: stats.lastEventConnector,
          recentErrors: stats.errors.map(e => ({
            time: new Date(e.time).toISOString(),
            message: e.message,
          })),
        },
        connectors: statuses.map(s => ({
          id: s.id,
          type: s.type,
          displayName: s.displayName,
          connected: s.connected,
          health: s.health,
        })),
        events: {
          totalInDb: ctx.eventStore.count(),
          activeCount: activeEvents.length,
          recent: recentEvents.map(e => ({
            id: e.id,
            connector: e.connectorId,
            severity: e.severity,
            title: e.title,
            time: new Date(e.timestamp).toISOString(),
            dismissed: e.dismissed,
          })),
        },
      },
    });
  });

  // Quick ping endpoint (no auth needed for testing)
  server.get(`${API_PREFIX}/ping`, async (_request, reply) => {
    return reply.send({ ok: true, ts: Date.now() });
  });
}
