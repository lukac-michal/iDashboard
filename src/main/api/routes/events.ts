// ============================================================
// Event Routes - POST/GET/DELETE events
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';
import type { PushEventRequest } from '@shared/types';

export function registerEventRoutes(server: FastifyInstance, ctx: APIContext): void {
  // Push an event
  server.post(`${API_PREFIX}/events`, async (request, reply) => {
    const body = request.body as PushEventRequest;

    if (!body || (!body.connector && !body.title)) {
      return reply.code(400).send({ ok: false, error: 'Missing connector or title' });
    }

    // Deduplication check
    if (ctx.config.events.deduplication.enabled && body.title) {
      const connectorId = body.connector ?? 'generic-push';
      if (ctx.eventStore.isDuplicate(connectorId, body.title, ctx.config.events.deduplication.windowMs)) {
        return reply.code(200).send({ ok: true, data: { deduplicated: true } });
      }
    }

    const event = ctx.engine.handlePushEvent(body.connector ?? 'generic-push', body);

    if (!event) {
      return reply.code(422).send({ ok: false, error: 'Failed to process event' });
    }

    // Persist to database
    ctx.eventStore.insert(event);
    ctx.aggregator.recordEvent(event);

    // Broadcast to WebSocket clients
    ctx.broadcastEvent(event);

    return reply.code(201).send({ ok: true, data: { id: event.id } });
  });

  // List recent events
  server.get(`${API_PREFIX}/events`, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const since = query.since ? parseInt(query.since, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit, 10) : 100;

    const events = ctx.eventStore.getRecent(limit, since);
    return reply.send({ ok: true, data: events });
  });

  // Get active (non-dismissed, non-expired) events
  server.get(`${API_PREFIX}/events/active`, async (_request, reply) => {
    const events = ctx.eventStore.getActive();
    return reply.send({ ok: true, data: events });
  });

  // Dismiss an event
  server.delete(`${API_PREFIX}/events/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dismissed = ctx.eventStore.dismiss(id);

    if (!dismissed) {
      return reply.code(404).send({ ok: false, error: 'Event not found' });
    }

    ctx.broadcastEvent({ type: 'dismiss', eventId: id });
    return reply.send({ ok: true });
  });
}
