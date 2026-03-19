// ============================================================
// Message API Routes - Agent-to-agent messaging
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { MasterAgentService } from '@main/services/master-agent';

export function registerMessageRoutes(fastify: FastifyInstance, masterAgent: MasterAgentService): void {
  // Send message
  fastify.post('/api/v1/messages', async (request, reply) => {
    const { from, to, body } = request.body as { from: string; to: string; body: string };
    if (!from || !to || !body) {
      return reply.status(400).send({ ok: false, error: 'from, to, and body are required' });
    }
    const message = await masterAgent.sendMessage(from, to, body);
    return { ok: true, message };
  });

  // List messages
  fastify.get('/api/v1/messages', async (request) => {
    const { agent, limit } = request.query as { agent?: string; limit?: string };
    if (agent) {
      return masterAgent.getMessagesForAgent(agent);
    }
    return masterAgent.getMessages().slice(-(parseInt(limit || '100', 10)));
  });
}
