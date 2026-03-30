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

  // --- sendMessage ---

  it('sendMessage delivers to target agent terminal and records message', async () => {
    registry.register({
      id: 'a1',
      name: 'Architect',
      status: 'online',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const msg = await master.sendMessage('PM', 'Architect', 'Design the auth system');

    expect(msg.from).toBe('PM');
    expect(msg.to).toBe('Architect');
    expect(msg.body).toBe('Design the auth system');
    expect(lifecycle.sendTextToAgent).toHaveBeenCalledWith('a1', expect.stringContaining('Design the auth system'));
    expect(master.getMessages()).toHaveLength(1);
  });

  it('sendMessage records message even if target agent has no session', async () => {
    // Agent not registered — sendTextToAgent will fail, but message should still be recorded
    const msg = await master.sendMessage('PM', 'Unknown', 'Hello');

    expect(msg.from).toBe('PM');
    expect(msg.to).toBe('Unknown');
    expect(master.getMessages()).toHaveLength(1);
  });

  it('sendMessage emits message event', async () => {
    const handler = vi.fn();
    master.on('message', handler);

    await master.sendMessage('A', 'B', 'test');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].from).toBe('A');
  });

  // --- getMessagesForAgent ---

  it('getMessagesForAgent filters messages by agent name', async () => {
    registry.register({ id: 'a1', name: 'Arch', status: 'online', registeredAt: Date.now(), lastSeenAt: Date.now() });
    registry.register({ id: 'a2', name: 'Impl', status: 'online', registeredAt: Date.now(), lastSeenAt: Date.now() });

    await master.sendMessage('PM', 'Arch', 'task 1');
    await master.sendMessage('PM', 'Impl', 'task 2');
    await master.sendMessage('Arch', 'PM', 'done');

    const archMessages = master.getMessagesForAgent('Arch');
    expect(archMessages).toHaveLength(2); // sent to Arch + sent from Arch

    const implMessages = master.getMessagesForAgent('Impl');
    expect(implMessages).toHaveLength(1);
  });

  // --- broadcastMessage ---

  it('broadcastMessage sends to all online agents except sender', async () => {
    registry.register({ id: 'a1', name: 'Agent1', status: 'online', registeredAt: Date.now(), lastSeenAt: Date.now() });
    registry.register({ id: 'a2', name: 'Agent2', status: 'online', registeredAt: Date.now(), lastSeenAt: Date.now() });
    registry.register({ id: 'a3', name: 'Agent3', status: 'offline', registeredAt: Date.now(), lastSeenAt: Date.now() });

    await master.broadcastMessage('Agent1', 'Hello everyone');

    const messages = master.getMessages();
    // Should send to Agent2 only (Agent1 is sender, Agent3 is offline)
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe('Agent2');
    expect(messages[0].from).toBe('Agent1');
  });
});
