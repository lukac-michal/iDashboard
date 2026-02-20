// ============================================================
// Connector Routes - List connector statuses
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';

export function registerConnectorRoutes(server: FastifyInstance, ctx: APIContext): void {
  server.get(`${API_PREFIX}/connectors`, async (_request, reply) => {
    const statuses = ctx.engine.getStatuses();
    return reply.send({ ok: true, data: statuses });
  });

  server.get(`${API_PREFIX}/connectors/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const statuses = ctx.engine.getStatuses();
    const connector = statuses.find(s => s.id === id);

    if (!connector) {
      return reply.code(404).send({ ok: false, error: 'Connector not found' });
    }

    return reply.send({ ok: true, data: connector });
  });

  server.get(`${API_PREFIX}/connectors/:id/events`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, string>;
    const limit = query.limit ? parseInt(query.limit, 10) : 50;

    const events = ctx.eventStore.getByConnector(id, limit);
    return reply.send({ ok: true, data: events });
  });
}
