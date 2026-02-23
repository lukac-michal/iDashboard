// ============================================================
// MasterAgentService Slack Bridge Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MasterAgentService } from '@main/services/master-agent';
import { AgentRegistry } from '@main/services/agent-registry';
import type { AgentLifecycleService } from '@main/services/agent-lifecycle';
import type { ConnectorEngine } from '@main/connectors/engine';

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

function createMockEngine(hasSlack: boolean): ConnectorEngine {
  return {
    getStatuses: vi.fn().mockReturnValue(
      hasSlack
        ? [{ id: 'slack-1', type: 'slack', displayName: 'Slack', connected: true, eventCount: 0 }]
        : [],
    ),
    executeAction: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConnectorEngine;
}

describe('MasterAgentService — Slack bridge', () => {
  let registry: AgentRegistry;
  let lifecycle: AgentLifecycleService;

  beforeEach(() => {
    registry = new AgentRegistry(5000);
    lifecycle = createMockLifecycle();
  });

  it('sendToSlack calls engine.executeAction with correct params', async () => {
    const engine = createMockEngine(true);
    const master = new MasterAgentService(lifecycle, registry, engine);

    await master.sendToSlack('#general', 'Hello from agent!');

    expect(engine.executeAction).toHaveBeenCalledWith('slack-1', 'send-message', {
      channel: '#general',
      text: 'Hello from agent!',
    });
  });

  it('sendToSlack records an outbound message', async () => {
    const engine = createMockEngine(true);
    const master = new MasterAgentService(lifecycle, registry, engine);

    await master.sendToSlack('#dev', 'PR merged');

    const messages = master.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe('master');
    expect(messages[0].to).toBe('slack:#dev');
    expect(messages[0].body).toBe('PR merged');
    expect(messages[0].direction).toBe('outbound');
  });

  it('sendToSlack emits message event', async () => {
    const engine = createMockEngine(true);
    const master = new MasterAgentService(lifecycle, registry, engine);

    const handler = vi.fn();
    master.on('message', handler);
    await master.sendToSlack('#general', 'test');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].to).toBe('slack:#general');
  });

  it('sendToSlack throws when no Slack connector', async () => {
    const engine = createMockEngine(false);
    const master = new MasterAgentService(lifecycle, registry, engine);

    await expect(master.sendToSlack('#x', 'test')).rejects.toThrow('No Slack connector found');
  });

  it('sendToSlack throws when no connector engine', async () => {
    const master = new MasterAgentService(lifecycle, registry);

    await expect(master.sendToSlack('#x', 'test')).rejects.toThrow('No connector engine available');
  });

  it('inbound Slack messages appear in message log via recordInboundMessage', () => {
    const engine = createMockEngine(true);
    const master = new MasterAgentService(lifecycle, registry, engine);

    master.recordInboundMessage('slack:#general', 'New message from user');

    const messages = master.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe('slack:#general');
    expect(messages[0].to).toBe('master');
    expect(messages[0].direction).toBe('inbound');
  });

  it('existing routeTask still works with connectorEngine param', async () => {
    const engine = createMockEngine(true);
    const master = new MasterAgentService(lifecycle, registry, engine);

    registry.register({
      id: 'a1',
      name: 'worker',
      status: 'online',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    await master.routeTask('a1', 'Build feature');

    expect(lifecycle.sendTextToAgent).toHaveBeenCalledWith('a1', 'Build feature');
    const messages = master.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe('master');
    expect(messages[0].to).toBe('worker');
  });
});
