// ============================================================
// Webhook Routes - Inbound webhook receiver with signature verification
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { APIContext } from '../server';
import { API_PREFIX, WEBHOOK_SOURCES } from '@shared/constants';
import type { WebhookSource } from '@shared/constants';
import { WebhookReceiver } from '@main/connectors/webhook-receiver';

// Cache webhook receivers keyed by connector ID
const receivers = new Map<string, WebhookReceiver>();

export function registerWebhookRoutes(server: FastifyInstance, ctx: APIContext): void {
  // Add raw body parser for signature verification
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const json = JSON.parse(body as string);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  server.post(`${API_PREFIX}/webhooks/:source`, {
    config: { rawBody: true },
  }, async (request, reply) => {
    const { source } = request.params as { source: string };

    if (!WEBHOOK_SOURCES.includes(source as WebhookSource)) {
      return reply.code(400).send({ ok: false, error: `Unknown webhook source: ${source}` });
    }

    // Find webhook connector configs matching this source
    const statuses = ctx.engine.getStatuses();
    const webhookConnectors = statuses.filter(s => s.type === 'webhook');

    if (webhookConnectors.length === 0) {
      // Accept anyway with generic handling
      const receiver = new WebhookReceiver({
        source: source as WebhookSource,
        connectorId: `webhook-${source}`,
        displayName: `Webhook: ${source}`,
      });

      const events = receiver.parsePayload({
        headers: request.headers as Record<string, string>,
        body: request.body,
        source,
      });

      for (const event of events) {
        ctx.eventStore.insert(event);
        ctx.aggregator.recordEvent(event);
        ctx.broadcastEvent(event);
      }

      return reply.code(201).send({ ok: true, data: { received: events.length } });
    }

    // Process through configured webhook connectors
    let totalReceived = 0;

    for (const connector of webhookConnectors) {
      let receiver = receivers.get(connector.id);
      if (!receiver) {
        // TODO: Get actual config from engine
        receiver = new WebhookReceiver({
          source: source as WebhookSource,
          connectorId: connector.id,
          displayName: connector.displayName,
        });
        receivers.set(connector.id, receiver);
      }

      // Verify signature
      const rawBody = JSON.stringify(request.body);
      const payload = {
        headers: request.headers as Record<string, string>,
        body: request.body,
        source,
      };

      if (!receiver.verifySignature(payload, rawBody)) {
        return reply.code(401).send({ ok: false, error: 'Invalid webhook signature' });
      }

      const events = receiver.parsePayload(payload);
      for (const event of events) {
        ctx.eventStore.insert(event);
        ctx.aggregator.recordEvent(event);
        ctx.broadcastEvent(event);
      }
      totalReceived += events.length;
    }

    return reply.code(201).send({ ok: true, data: { received: totalReceived } });
  });
}
