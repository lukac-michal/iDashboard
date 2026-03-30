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

// Mock fs so loadPreamble doesn't read from disk
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('Preamble for {{AGENT_NAME}} on port {{PORT}}'),
  existsSync: vi.fn().mockReturnValue(true),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
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
    lifecycle = new AgentLifecycleService(registry, adapter, '/tmp/repo', 19280);
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

  it('spawns with preamble in system prompt', async () => {
    await lifecycle.spawnAgent({ name: 'be' });
    expect(adapter.createTab).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.stringContaining('--append-system-prompt'),
      }),
    );
  });

  it('loadPreamble replaces placeholders', () => {
    const result = lifecycle.loadPreamble('TestAgent');
    expect(result).toContain('TestAgent');
    expect(result).toContain('19280');
    expect(result).not.toContain('{{AGENT_NAME}}');
    expect(result).not.toContain('{{PORT}}');
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

  // --- findAgentByTerminalId ---

  it('findAgentByTerminalId matches GUID from ITERM_SESSION_ID format', async () => {
    // Mock createTab to return a session with a sessionId (GUID)
    (adapter.createTab as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'worker',
      windowId: 1,
      tabId: 1,
      sessionId: 'ABC-DEF-123',
    });

    const agent = await lifecycle.spawnAgent({ name: 'worker' });

    // ITERM_SESSION_ID format is "w0t3p0:GUID"
    expect(lifecycle.findAgentByTerminalId('w0t1p0:ABC-DEF-123')).toBe(agent.id);
  });

  it('findAgentByTerminalId returns undefined for non-matching ID', async () => {
    (adapter.createTab as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'worker',
      windowId: 1,
      tabId: 1,
      sessionId: 'ABC-DEF-123',
    });

    await lifecycle.spawnAgent({ name: 'worker' });
    expect(lifecycle.findAgentByTerminalId('w0t1p0:XYZ-999')).toBeUndefined();
  });

  it('findAgentByTerminalId returns undefined for empty input', () => {
    expect(lifecycle.findAgentByTerminalId('')).toBeUndefined();
  });

  // --- terminateAgent ---

  it('terminateAgent unregisters agent and removes session', async () => {
    const agent = await lifecycle.spawnAgent({ name: 'worker' });
    expect(registry.getAll()).toHaveLength(1);

    await lifecycle.terminateAgent(agent.id);

    expect(registry.getAll()).toHaveLength(0);
    await expect(lifecycle.sendTextToAgent(agent.id, 'hi')).rejects.toThrow('No session found');
  });

  it('terminateAgent calls adapter.terminate when available', async () => {
    const terminateFn = vi.fn().mockResolvedValue(undefined);
    (adapter as Record<string, unknown>).terminate = terminateFn;

    const agent = await lifecycle.spawnAgent({ name: 'worker' });
    await lifecycle.terminateAgent(agent.id);

    expect(terminateFn).toHaveBeenCalled();
  });

  it('terminateAgent for unknown agent just unregisters from registry', async () => {
    registry.register({
      id: 'orphan',
      name: 'orphan',
      status: 'offline',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    await lifecycle.terminateAgent('orphan');
    expect(registry.get('orphan')).toBeUndefined();
  });

  // --- recoverAgents ---

  it('recoverAgents matches agents to sessions by name', async () => {
    // Pre-populate registry (simulating DB load)
    registry.register({
      id: 'a1',
      name: 'PM',
      status: 'stale',
      sessionName: 'PM',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    (adapter.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'PM', windowId: 1, tabId: 1, sessionId: 'sess-1' },
    ]);

    await lifecycle.recoverAgents();

    // Agent should be marked stale (awaiting heartbeat), not offline
    expect(registry.get('a1')?.status).toBe('stale');
    // Session should be mapped — sendText should work
    await lifecycle.sendTextToAgent('a1', 'hello');
    expect(adapter.writeText).toHaveBeenCalled();
  });

  it('recoverAgents removes agents with no matching session', async () => {
    registry.register({
      id: 'a1',
      name: 'DeadAgent',
      status: 'stale',
      sessionName: 'DeadAgent',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    (adapter.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await lifecycle.recoverAgents();

    expect(registry.get('a1')).toBeUndefined();
    expect(registry.getAll()).toHaveLength(0);
  });

  it('recoverAgents removes all when terminal not running', async () => {
    registry.register({
      id: 'a1',
      name: 'Agent1',
      status: 'stale',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    registry.register({
      id: 'a2',
      name: 'Agent2',
      status: 'stale',
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    (adapter.isRunning as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await lifecycle.recoverAgents();

    expect(registry.getAll()).toHaveLength(0);
  });

  it('recoverAgents is a no-op when registry is empty', async () => {
    await lifecycle.recoverAgents();
    expect(adapter.isRunning).not.toHaveBeenCalled();
  });
});
