// ============================================================
// Auth Routes - OAuth flow initiation and status
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';

export function registerAuthRoutes(server: FastifyInstance, _ctx: APIContext): void {
  // Start OAuth flow for a connector
  server.post(`${API_PREFIX}/auth/:connectorId/start`, async (request, reply) => {
    const { connectorId } = request.params as { connectorId: string };
    // OAuth flows are initiated from the renderer via IPC, not HTTP
    // This endpoint exists for completeness / external tooling
    return reply.send({
      ok: true,
      data: { message: `OAuth flow for ${connectorId} should be initiated via the settings UI` },
    });
  });

  // Check OAuth flow status
  server.get(`${API_PREFIX}/auth/:connectorId/status`, async (request, reply) => {
    const { connectorId } = request.params as { connectorId: string };
    return reply.send({
      ok: true,
      data: { connectorId, authenticated: false },
    });
  });
}
