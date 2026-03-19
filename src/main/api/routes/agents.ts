// ============================================================
// Agent List Routes - GET /api/v1/agents
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';

export function registerAgentListRoutes(server: FastifyInstance, ctx: APIContext): void {
  server.get(`${API_PREFIX}/agents`, async (_request, reply) => {
    if (!ctx.agentRegistry) {
      return reply.code(503).send({
        ok: false,
        error: 'Agent registry not available (experimental mode not enabled)',
      });
    }
    return ctx.agentRegistry.getAll();
  });
}
