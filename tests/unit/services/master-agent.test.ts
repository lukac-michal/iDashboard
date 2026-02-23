// ============================================================
// MasterAgentService Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MasterAgentService } from '@main/services/master-agent';
import { AgentRegistry } from '@main/services/agent-registry';
import type { AgentLifecycleService } from '@main/services/agent-lifecycle';

// Suppress log output in tests
vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

function createMockLifecycle(): AgentLifecycleService {
  return {
    sendTextToAgent: vi.fn().mockResolvedValue(undefined),
    spawnAgent: vi.fn(),
    focusAgent: vi.fn(),
    startHealthMonitoring: vi.fn(),
    stopHealthMonitoring: vi.fn(),
    destroy: vi.fn(),
  } as unknown as AgentLifecycleService;
}

describe('MasterAgentService', () => {
  let registry: AgentRegistry;
  let lifecycle: AgentLifecycleService;
  let master: MasterAgentService;

  beforeEach(() => {
    registry = new AgentRegistry(5000);
    lifecycle = createMockLifecycle();
    master = new MasterAgentService(lifecycle, registry);
  });

  it('routes a task to an agent', async () => {
    registry.register({
      id: 'a1',
      name: 'frontend',
      status: 'online',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    await master.routeTask('a1', 'Build the login page');

    expect(lifecycle.sendTextToAgent).toHaveBeenCalledWith('a1', 'Build the login page');
    const messages = master.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe('master');
    expect(messages[0].to).toBe('frontend');
    expect(messages[0].body).toBe('Build the login page');
    expect(messages[0].direction).toBe('outbound');
  });

  it('throws when routing to unknown agent', async () => {
    await expect(master.routeTask('nope', 'task')).rejects.toThrow('Agent nope not found');
  });

  it('records inbound messages', () => {
    registry.register({
      id: 'a1',
      name: 'backend',
      status: 'online',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    master.recordInboundMessage('a1', 'Task complete, PR ready');

    const messages = master.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe('backend');
    expect(messages[0].to).toBe('master');
    expect(messages[0].body).toBe('Task complete, PR ready');
    expect(messages[0].direction).toBe('inbound');
  });

  it('records inbound from unknown agent using id as name', () => {
    master.recordInboundMessage('unknown-id', 'hello');
    const messages = master.getMessages();
    expect(messages[0].from).toBe('unknown-id');
  });

  it('emits message event on routeTask', async () => {
    registry.register({
      id: 'a1',
      name: 'worker',
      status: 'online',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const handler = vi.fn();
    master.on('message', handler);
    await master.routeTask('a1', 'do work');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].direction).toBe('outbound');
  });

  it('emits message event on recordInboundMessage', () => {
    const handler = vi.fn();
    master.on('message', handler);
    master.recordInboundMessage('a1', 'done');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].direction).toBe('inbound');
  });

  it('enforces max message limit', async () => {
    registry.register({
      id: 'a1',
      name: 'worker',
      status: 'online',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    for (let i = 0; i < 1005; i++) {
      master.recordInboundMessage('a1', `msg ${i}`);
    }

    const messages = master.getMessages();
    expect(messages.length).toBe(1000);
    // Oldest messages should be dropped
    expect(messages[0].body).toBe('msg 5');
    expect(messages[999].body).toBe('msg 1004');
  });

  it('getMessages returns a copy', () => {
    master.recordInboundMessage('a1', 'msg');
    const m1 = master.getMessages();
    const m2 = master.getMessages();
    expect(m1).not.toBe(m2);
    expect(m1).toEqual(m2);
  });
});
