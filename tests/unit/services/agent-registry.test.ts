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

  // --- findByName ---

  it('findByName finds agent case-insensitively', () => {
    registry.register(makeAgent('a1', 'FrontEnd'));
    expect(registry.findByName('frontend')?.id).toBe('a1');
    expect(registry.findByName('FRONTEND')?.id).toBe('a1');
    expect(registry.findByName('FrontEnd')?.id).toBe('a1');
  });

  it('findByName returns undefined for unknown name', () => {
    registry.register(makeAgent('a1', 'backend'));
    expect(registry.findByName('nope')).toBeUndefined();
  });

  it('findByName prefers online agent over offline duplicate', () => {
    registry.register(makeAgent('a1', 'PM'));
    registry.updateStatus('a1', 'offline');
    registry.register(makeAgent('a2', 'PM'));
    // a2 is online, a1 is offline — should return a2
    expect(registry.findByName('PM')?.id).toBe('a2');
  });

  it('findByName returns offline agent as fallback when no online match', () => {
    registry.register(makeAgent('a1', 'PM'));
    registry.updateStatus('a1', 'offline');
    expect(registry.findByName('PM')?.id).toBe('a1');
  });

  it('findByName prefers online over stale', () => {
    registry.register(makeAgent('a1', 'Worker'));
    registry.updateStatus('a1', 'stale');
    registry.register(makeAgent('a2', 'Worker'));
    expect(registry.findByName('Worker')?.id).toBe('a2');
  });

  // --- updateReport ---

  it('updateReport sets report fields and emits agent:updated', () => {
    const handler = vi.fn();
    registry.on('agent:updated', handler);
    registry.register(makeAgent('a1', 'worker'));
    handler.mockClear();

    const result = registry.updateReport('a1', 'working', 'Implementing feature X');
    expect(result).toBe(true);

    const agent = registry.get('a1')!;
    expect(agent.reportStatus).toBe('working');
    expect(agent.shortSummary).toBe('Implementing feature X');
    expect(agent.lastReportAt).toBeGreaterThan(0);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('updateReport returns false for unknown agent', () => {
    expect(registry.updateReport('nope', 'done', 'finished')).toBe(false);
  });
});
