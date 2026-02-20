// ============================================================
// Health Routes - App health check
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';

export function registerHealthRoutes(server: FastifyInstance, ctx: APIContext): void {
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
}
