// ============================================================
// Agent List Route Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerAgentListRoutes } from '@main/api/routes/agents';
import type { APIContext } from '@main/api/server';
import { AgentRegistry } from '@main/services/agent-registry';

vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('GET /api/v1/agents', () => {
  let server: FastifyInstance;
  let registry: AgentRegistry;

  beforeEach(async () => {
    registry = new AgentRegistry(5000);
    server = Fastify();
    registerAgentListRoutes(server, {
      agentRegistry: registry,
    } as unknown as APIContext);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns empty array when no agents', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/agents' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual([]);
  });

  it('returns registered agents', async () => {
    registry.register({
      id: 'agent-1',
      name: 'FrontendDev',
      status: 'online',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    registry.register({
      id: 'agent-2',
      name: 'BackendDev',
      status: 'online',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const res = await server.inject({ method: 'GET', url: '/api/v1/agents' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('FrontendDev');
    expect(body[1].name).toBe('BackendDev');
  });

  it('returns 503 when registry not available', async () => {
    const noRegistryServer = Fastify();
    registerAgentListRoutes(noRegistryServer, {
      agentRegistry: null,
    } as unknown as APIContext);
    await noRegistryServer.ready();

    const res = await noRegistryServer.inject({ method: 'GET', url: '/api/v1/agents' });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload).ok).toBe(false);

    await noRegistryServer.close();
  });
});
