// ============================================================
// Agent Report Routes - Agents POST status reports here
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';
import { log, warn } from '@main/utils/log';
import type { AgentReportRequest, AgentReportStatus } from '@shared/types';

const VALID_STATUSES: AgentReportStatus[] = ['working', 'done', 'question', 'blocked', 'error'];

export function registerAgentReportRoutes(server: FastifyInstance, ctx: APIContext): void {
  server.post(`${API_PREFIX}/agent-report`, async (request, reply) => {
    const body = request.body as Partial<AgentReportRequest> | null;

    if (!body || !body.agentName || !body.status || !body.shortSummary) {
      return reply.code(400).send({
        ok: false,
        error: 'Missing required fields: agentName, status, shortSummary',
      });
    }

    if (!VALID_STATUSES.includes(body.status)) {
      return reply.code(400).send({
        ok: false,
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const registry = ctx.agentRegistry;
    if (!registry) {
      return reply.code(503).send({
        ok: false,
        error: 'Agent registry not available (experimental mode not enabled)',
      });
    }

    const agent = registry.findByName(body.agentName);
    if (!agent) {
      return reply.code(404).send({
        ok: false,
        error: `Agent "${body.agentName}" not found in registry`,
      });
    }

    registry.updateReport(agent.id, body.status, body.shortSummary);
    log('AgentReport', `${body.agentName}: ${body.status} — ${body.shortSummary}`);

    // Surface notification for question/blocked statuses
    if ((body.status === 'question' || body.status === 'blocked') && ctx.surfaceNotification) {
      log('AgentReport', `Surfacing notification for ${body.agentName} (${body.status})`);
      ctx.surfaceNotification();
    }

    // Route longSummary to PM agent if available
    const currentPmId = ctx.getPmAgentId?.() ?? ctx.pmAgentId;
    if (body.longSummary && ctx.masterAgent && currentPmId) {
      try {
        await ctx.masterAgent.routeTask(currentPmId, `[Report from ${body.agentName} — ${body.status}]\n${body.longSummary}`);
      } catch (err) {
        warn('AgentReport', `Failed to route longSummary to PM agent: ${err}`);
      }
    }

    return reply.send({ ok: true, agentId: agent.id });
  });
}
