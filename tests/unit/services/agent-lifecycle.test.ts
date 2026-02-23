// ============================================================
// AgentLifecycleService Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentLifecycleService } from '@main/services/agent-lifecycle';
import { AgentRegistry } from '@main/services/agent-registry';
import type { TerminalAdapter, TerminalSession } from '@main/services/terminal-adapter';

// Suppress log output in tests
vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

function createMockAdapter(): TerminalAdapter {
  return {
    isRunning: vi.fn().mockResolvedValue(true),
    listSessions: vi.fn().mockResolvedValue([]),
    findSession: vi.fn().mockResolvedValue(null),
    focusSession: vi.fn().mockResolvedValue(undefined),
    createTab: vi.fn().mockResolvedValue({ name: 'test', windowId: 1, tabId: 1 }),
    writeText: vi.fn().mockResolvedValue(undefined),
    activate: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AgentLifecycleService', () => {
  let registry: AgentRegistry;
  let adapter: TerminalAdapter;
  let lifecycle: AgentLifecycleService;

  beforeEach(() => {
    registry = new AgentRegistry(5000);
    adapter = createMockAdapter();
    lifecycle = new AgentLifecycleService(registry, adapter, '/tmp/repo');
  });

  afterEach(() => {
    lifecycle.destroy();
  });

  it('spawns an agent and registers it', async () => {
    const agent = await lifecycle.spawnAgent({ name: 'frontend' });
    expect(agent.name).toBe('frontend');
    expect(agent.status).toBe('online');
    expect(registry.getAll()).toHaveLength(1);
    expect(adapter.createTab).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'frontend', cwd: '/tmp/repo' }),
    );
  });

  it('spawns with profile path', async () => {
    await lifecycle.spawnAgent({ name: 'be', profilePath: '/path/to/profile.md' });
    expect(adapter.createTab).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.stringContaining('claude --profile'),
      }),
    );
  });

  it('sends text to a spawned agent', async () => {
    const agent = await lifecycle.spawnAgent({ name: 'worker' });
    await lifecycle.sendTextToAgent(agent.id, 'do stuff');
    expect(adapter.writeText).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'worker' }),
      'do stuff',
    );
  });

  it('throws when sending text to unknown agent', async () => {
    await expect(lifecycle.sendTextToAgent('nope', 'hi')).rejects.toThrow('No session found');
  });

  it('focuses a spawned agent', async () => {
    const agent = await lifecycle.spawnAgent({ name: 'frontend' });
    await lifecycle.focusAgent(agent.id);
    expect(adapter.focusSession).toHaveBeenCalled();
    expect(adapter.activate).toHaveBeenCalled();
  });

  it('throws when focusing unknown agent', async () => {
    await expect(lifecycle.focusAgent('nope')).rejects.toThrow('No session found');
  });

  it('health monitoring marks agents offline when session disappears', async () => {
    vi.useFakeTimers();
    const agent = await lifecycle.spawnAgent({ name: 'worker' });

    // Session not found in list
    (adapter.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    lifecycle.startHealthMonitoring(1000);
    await vi.advanceTimersByTimeAsync(1100);

    expect(registry.get(agent.id)?.status).toBe('offline');
    vi.useRealTimers();
  });

  it('health monitoring keeps agents online when session exists', async () => {
    vi.useFakeTimers();
    const agent = await lifecycle.spawnAgent({ name: 'worker' });

    (adapter.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'worker', windowId: 1, tabId: 1 },
    ]);

    lifecycle.startHealthMonitoring(1000);
    await vi.advanceTimersByTimeAsync(1100);

    expect(registry.get(agent.id)?.status).toBe('online');
    vi.useRealTimers();
  });

  it('health monitoring marks all offline when terminal not running', async () => {
    vi.useFakeTimers();
    const agent = await lifecycle.spawnAgent({ name: 'worker' });

    (adapter.isRunning as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    lifecycle.startHealthMonitoring(1000);
    await vi.advanceTimersByTimeAsync(1100);

    expect(registry.get(agent.id)?.status).toBe('offline');
    vi.useRealTimers();
  });

  it('destroy clears health timer and session map', () => {
    lifecycle.startHealthMonitoring(1000);
    lifecycle.destroy();
    // No error = success; internal timer and map are cleared
  });
});
