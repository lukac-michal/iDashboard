// ============================================================
// Local API Server - Fastify HTTP + WebSocket
// ============================================================

import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { API_PREFIX } from '@shared/constants';
import type { AppConfig } from '@shared/types';
import { registerEventRoutes } from './routes/events';
import { registerActionRoutes } from './routes/actions';
import { registerConnectorRoutes } from './routes/connectors';
import { registerWebhookRoutes } from './routes/webhooks';
import { registerHealthRoutes } from './routes/health';
import { registerWebSocket } from './websocket';
import type { ConnectorEngine } from '@main/connectors/engine';
import type { EventStore } from '@main/db/event-store';
import type { Aggregator } from '@main/db/aggregator';

export interface APIContext {
  engine: ConnectorEngine;
  eventStore: EventStore;
  aggregator: Aggregator;
  config: AppConfig;
  broadcastEvent: (event: unknown) => void;
}

export async function createAPIServer(ctx: APIContext): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false,
  });

  await server.register(fastifyWebsocket);

  // Rate limiting (simple in-memory)
  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  const maxRequests = ctx.config.api.rateLimit.maxRequestsPerMinute;

  server.addHook('onRequest', async (request, reply) => {
    // Auth check
    if (ctx.config.api.auth.enabled && ctx.config.api.auth.token) {
      const auth = request.headers.authorization;
      if (auth !== `Bearer ${ctx.config.api.auth.token}`) {
        return reply.code(401).send({ ok: false, error: 'Unauthorized' });
      }
    }

    // Rate limiting
    const ip = request.ip;
    const now = Date.now();
    const entry = requestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      requestCounts.set(ip, { count: 1, resetAt: now + 60_000 });
    } else {
      entry.count++;
      if (entry.count > maxRequests) {
        return reply.code(429).send({ ok: false, error: 'Rate limit exceeded' });
      }
    }
  });

  // Register routes
  registerEventRoutes(server, ctx);
  registerActionRoutes(server, ctx);
  registerConnectorRoutes(server, ctx);
  registerWebhookRoutes(server, ctx);
  registerHealthRoutes(server, ctx);
  registerWebSocket(server, ctx);

  return server;
}

export async function startAPIServer(
  server: FastifyInstance,
  port: number,
  bind: string,
): Promise<void> {
  try {
    await server.listen({ port, host: bind });
    console.log(`[API] Server listening on ${bind}:${port}`);
  } catch (err) {
    console.error('[API] Failed to start server:', err);
    throw err;
  }
}
