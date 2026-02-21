// ============================================================
// Event Routes - POST/GET/DELETE events
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX } from '@shared/constants';
import type { PushEventRequest } from '@shared/types';
import { recordEventReceived, recordError } from './health';

export function registerEventRoutes(server: FastifyInstance, ctx: APIContext): void {
  // Push an event
  server.post(`${API_PREFIX}/events`, async (request, reply) => {
    const raw = request.body as PushEventRequest & { connectorId?: string };
    // Accept both "connector" and "connectorId" field names
    const body: PushEventRequest = {
      ...raw,
      connector: raw.connector ?? raw.connectorId ?? '',
    };
    console.log(`[API] POST /events received from connector=${body.connector || 'unknown'} title="${body.title ?? ''}"`);

    if (!body.connector && !body.title) {
      const msg = 'Missing connector or title';
      console.log(`[API] POST /events rejected: ${msg}`);
      recordError(msg);
      return reply.code(400).send({ ok: false, error: msg });
    }

    // Deduplication check
    if (ctx.config.events.deduplication.enabled && body.title) {
      const connectorId = body.connector ?? 'generic-push';
      if (ctx.eventStore.isDuplicate(connectorId, body.title, ctx.config.events.deduplication.windowMs)) {
        console.log(`[API] POST /events deduplicated: "${body.title}"`);
        return reply.code(200).send({ ok: true, data: { deduplicated: true } });
      }
    }

    const event = ctx.engine.handlePushEvent(body.connector ?? 'generic-push', body);

    if (!event) {
      const msg = `Failed to process event from connector=${body.connector}`;
      console.log(`[API] POST /events ${msg}`);
      recordError(msg);
      return reply.code(422).send({ ok: false, error: 'Failed to process event' });
    }

    // Note: engine.handlePushEvent -> emitEvent -> onEvent callback already
    // persists to DB and pushes to renderer. We only broadcast to WS clients here.
    ctx.broadcastEvent(event);

    recordEventReceived(event.connectorId, event.title);
    console.log(`[API] POST /events OK: id=${event.id} severity=${event.severity} connector=${event.connectorId}`);
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
