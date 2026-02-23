// ============================================================
// AgentRegistry Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistry } from '@main/services/agent-registry';
import type { AgentInfo } from '@shared/types';

// Suppress log output in tests
vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

function makeAgent(id: string, name?: string): AgentInfo {
  return {
    id,
    name: name ?? id,
    status: 'online',
    registeredAt: Date.now(),
    lastSeenAt: Date.now(),
  };
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry(5000);
  });

  it('registers an agent and retrieves it', () => {
    registry.register(makeAgent('a1', 'frontend'));
    const all = registry.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('a1');
    expect(all[0].name).toBe('frontend');
  });

  it('emits agent:registered event', () => {
    const handler = vi.fn();
    registry.on('agent:registered', handler);
    registry.register(makeAgent('a1'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].id).toBe('a1');
  });

  it('unregisters an agent', () => {
    registry.register(makeAgent('a1'));
    expect(registry.unregister('a1')).toBe(true);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('returns false when unregistering non-existent agent', () => {
    expect(registry.unregister('nope')).toBe(false);
  });

  it('emits agent:unregistered event', () => {
    const handler = vi.fn();
    registry.on('agent:unregistered', handler);
    registry.register(makeAgent('a1'));
    registry.unregister('a1');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('updates agent status', () => {
    registry.register(makeAgent('a1'));
    expect(registry.updateStatus('a1', 'busy')).toBe(true);
    expect(registry.get('a1')?.status).toBe('busy');
  });

  it('returns false when updating non-existent agent', () => {
    expect(registry.updateStatus('nope', 'busy')).toBe(false);
  });

  it('emits agent:updated on status change', () => {
    const handler = vi.fn();
    registry.on('agent:updated', handler);
    registry.register(makeAgent('a1'));
    registry.updateStatus('a1', 'idle');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].status).toBe('idle');
  });

  it('heartbeat updates lastSeenAt', () => {
    registry.register(makeAgent('a1'));
    // Set lastSeenAt to the past to ensure heartbeat updates it
    const agent = registry.get('a1')!;
    agent.lastSeenAt = Date.now() - 1000;
    const before = agent.lastSeenAt;
    registry.heartbeat('a1');
    expect(registry.get('a1')!.lastSeenAt).toBeGreaterThan(before);
  });

  it('heartbeat revives stale agent to online', () => {
    const handler = vi.fn();
    registry.on('agent:updated', handler);
    registry.register(makeAgent('a1'));
    registry.updateStatus('a1', 'stale');
    handler.mockClear();
    registry.heartbeat('a1');
    expect(registry.get('a1')?.status).toBe('online');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('heartbeat returns false for non-existent agent', () => {
    expect(registry.heartbeat('nope')).toBe(false);
  });

  it('marks agents as stale after threshold', () => {
    registry.register(makeAgent('a1'));
    // Manually set lastSeenAt to the past
    const agent = registry.get('a1')!;
    agent.lastSeenAt = Date.now() - 10000; // 10s ago, threshold is 5s
    const stale = registry.markStale();
    expect(stale).toContain('a1');
    expect(registry.get('a1')?.status).toBe('stale');
  });

  it('does not mark offline agents as stale', () => {
    registry.register(makeAgent('a1'));
    registry.updateStatus('a1', 'offline');
    const agent = registry.get('a1')!;
    agent.lastSeenAt = Date.now() - 10000;
    const stale = registry.markStale();
    expect(stale).not.toContain('a1');
    expect(registry.get('a1')?.status).toBe('offline');
  });

  it('does not mark recently seen agents as stale', () => {
    registry.register(makeAgent('a1'));
    const stale = registry.markStale();
    expect(stale).toHaveLength(0);
    expect(registry.get('a1')?.status).toBe('online');
  });

  it('get returns undefined for unknown agent', () => {
    expect(registry.get('nope')).toBeUndefined();
  });
});
