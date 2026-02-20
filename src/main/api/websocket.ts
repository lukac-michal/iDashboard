// ============================================================
// WebSocket Handler - Real-time bidirectional communication
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { APIContext } from './server';
import { API_PREFIX } from '@shared/constants';

const clients = new Set<WebSocket>();

export function registerWebSocket(server: FastifyInstance, ctx: APIContext): void {
  server.get(`${API_PREFIX}/ws`, { websocket: true }, (socket, _request) => {
    clients.add(socket);
    console.log(`[WS] Client connected (total: ${clients.size})`);

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'subscribe':
            // Client wants to subscribe to specific connectors
            // For now, all clients receive all events
            socket.send(JSON.stringify({ type: 'subscribed', connectors: msg.connectors ?? [] }));
            break;

          case 'action':
            // Client wants to trigger an action
            if (msg.connectorId && msg.actionId) {
              ctx.engine.executeAction(msg.connectorId, msg.actionId, msg.params).catch(err => {
                socket.send(JSON.stringify({
                  type: 'error',
                  message: err instanceof Error ? err.message : String(err),
                }));
              });
            }
            break;

          case 'ping':
            socket.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch {
        // Ignore invalid messages
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      console.log(`[WS] Client disconnected (total: ${clients.size})`);
    });

    // Send current state on connect
    const statuses = ctx.engine.getStatuses();
    socket.send(JSON.stringify({ type: 'init', connectors: statuses }));
  });

  // Set up broadcast function
  ctx.broadcastEvent = (event: unknown) => {
    const msg = JSON.stringify({ type: 'event', data: event });
    for (const client of clients) {
      if (client.readyState === 1) { // OPEN
        client.send(msg);
      }
    }
  };
}

export function broadcastToClients(data: unknown): void {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}
