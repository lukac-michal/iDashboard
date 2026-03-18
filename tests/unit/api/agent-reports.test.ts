// ============================================================
// Agent Report Route Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerAgentReportRoutes } from '@main/api/routes/agent-reports';
import type { APIContext } from '@main/api/server';
import { AgentRegistry } from '@main/services/agent-registry';

vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('POST /api/v1/agent-report', () => {
  let server: FastifyInstance;
  let registry: AgentRegistry;
  let surfaceNotification: ReturnType<typeof vi.fn>;
  let mockRouteTask: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    registry = new AgentRegistry(5000);
    surfaceNotification = vi.fn();
    mockRouteTask = vi.fn().mockResolvedValue(undefined);

    registry.register({
      id: 'agent-1',
      name: 'FrontendDev',
      status: 'online',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    server = Fastify();
    registerAgentReportRoutes(server, {
      agentRegistry: registry,
      surfaceNotification,
      masterAgent: { routeTask: mockRouteTask } as unknown as APIContext['masterAgent'],
      pmAgentId: 'pm-1',
    } as unknown as APIContext);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it('updates agent report on valid request', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/agent-report',
      payload: {
        agentName: 'FrontendDev',
        status: 'working',
        shortSummary: 'Building login page',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
    expect(body.agentId).toBe('agent-1');

    const agent = registry.get('agent-1')!;
    expect(agent.reportStatus).toBe('working');
    expect(agent.shortSummary).toBe('Building login page');
  });

  it('returns 400 for missing fields', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/agent-report',
      payload: { agentName: 'FrontendDev' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).ok).toBe(false);
  });

  it('returns 400 for invalid status', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/agent-report',
      payload: {
        agentName: 'FrontendDev',
        status: 'invalid',
        shortSummary: 'test',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for unknown agent name', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/agent-report',
      payload: {
        agentName: 'UnknownAgent',
        status: 'working',
        shortSummary: 'test',
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('triggers notification on question status', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/v1/agent-report',
      payload: {
        agentName: 'FrontendDev',
        status: 'question',
        shortSummary: 'Need API key for auth service',
      },
    });

    expect(surfaceNotification).toHaveBeenCalledTimes(1);
  });

  it('triggers notification on blocked status', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/v1/agent-report',
      payload: {
        agentName: 'FrontendDev',
        status: 'blocked',
        shortSummary: 'Cannot access database',
      },
    });

    expect(surfaceNotification).toHaveBeenCalledTimes(1);
  });

  it('does not trigger notification on working status', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/v1/agent-report',
      payload: {
        agentName: 'FrontendDev',
        status: 'working',
        shortSummary: 'Making progress',
      },
    });

    expect(surfaceNotification).not.toHaveBeenCalled();
  });

  it('routes longSummary to PM agent', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/v1/agent-report',
      payload: {
        agentName: 'FrontendDev',
        status: 'done',
        shortSummary: 'Finished login page',
        longSummary: 'Implemented login form with validation, OAuth buttons, and error handling.',
      },
    });

    expect(mockRouteTask).toHaveBeenCalledWith(
      'pm-1',
      expect.stringContaining('Implemented login form'),
    );
  });

  it('case-insensitive agent name matching', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/agent-report',
      payload: {
        agentName: 'frontenddev',
        status: 'working',
        shortSummary: 'test',
      },
    });

    expect(res.statusCode).toBe(200);
  });
});
