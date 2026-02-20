// ============================================================
// Action Routes - Trigger connector actions
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';

export function registerActionRoutes(server: FastifyInstance, ctx: APIContext): void {
  server.post(`${API_PREFIX}/actions/:connectorId/:actionId`, async (request, reply) => {
    const { connectorId, actionId } = request.params as { connectorId: string; actionId: string };
    const params = request.body;

    try {
      await ctx.engine.executeAction(connectorId, actionId, params);
      return reply.send({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(404).send({ ok: false, error: msg });
    }
  });
}
