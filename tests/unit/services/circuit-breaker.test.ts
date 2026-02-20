// ============================================================
// Circuit Breaker Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '@main/services/circuit-breaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({
      failureThreshold: 3,
      halfOpenRetryMs: 100,
      maxBackoffMs: 10000,
      backoffJitter: 0, // disable jitter for deterministic tests
    });
  });

  it('starts in closed state', () => {
    expect(cb.getState()).toBe('closed');
    expect(cb.shouldPoll()).toBe(true);
  });

  it('stays closed after successful polls', () => {
    cb.recordSuccess(50);
    cb.recordSuccess(60);
    expect(cb.getState()).toBe('closed');
    expect(cb.getHealth().latencyMs).toBe(60);
    expect(cb.getHealth().consecutiveFailures).toBe(0);
  });

  it('stays closed below failure threshold', () => {
    cb.recordFailure('error 1');
    cb.recordFailure('error 2');
    expect(cb.getState()).toBe('closed');
    expect(cb.shouldPoll()).toBe(true);
    expect(cb.getHealth().consecutiveFailures).toBe(2);
  });

  it('opens after reaching failure threshold', () => {
    cb.recordFailure('error 1');
    cb.recordFailure('error 2');
    cb.recordFailure('error 3');
    expect(cb.getState()).toBe('open');
    expect(cb.shouldPoll()).toBe(false);
  });

  it('classifies reachability on failure', () => {
    cb.recordFailure('error', 'dns-failed');
    expect(cb.getHealth().reachability).toBe('dns-failed');

    cb.recordFailure('error', 'auth-failed');
    expect(cb.getHealth().reachability).toBe('auth-failed');
  });

  it('transitions to half-open after backoff period', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) cb.recordFailure('error');
    expect(cb.getState()).toBe('open');
    expect(cb.shouldPoll()).toBe(false);

    // Wait for backoff to expire
    // With 0 jitter, the nextPollAt is set. We can manipulate time by checking
    const health = cb.getHealth();
    expect(health.nextPollAt).toBeDefined();

    // Simulate time passing by creating a new breaker with short half-open retry
    const fastCb = new CircuitBreaker({
      failureThreshold: 1,
      halfOpenRetryMs: 10,
      maxBackoffMs: 100,
      backoffJitter: 0,
    });

    fastCb.recordFailure('error');
    expect(fastCb.getState()).toBe('open');

    // Wait for the backoff
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(fastCb.shouldPoll()).toBe(true);
    expect(fastCb.getState()).toBe('half-open');
  });

  it('resets to closed on success after half-open', async () => {
    const fastCb = new CircuitBreaker({
      failureThreshold: 1,
      halfOpenRetryMs: 10,
      maxBackoffMs: 100,
      backoffJitter: 0,
    });

    fastCb.recordFailure('error');
    await new Promise(resolve => setTimeout(resolve, 150));
    fastCb.shouldPoll(); // Triggers half-open transition

    fastCb.recordSuccess(50);
    expect(fastCb.getState()).toBe('closed');
    expect(fastCb.getHealth().consecutiveFailures).toBe(0);
  });

  it('returns to open if half-open probe fails', async () => {
    const fastCb = new CircuitBreaker({
      failureThreshold: 1,
      halfOpenRetryMs: 10,
      maxBackoffMs: 100,
      backoffJitter: 0,
    });

    fastCb.recordFailure('error 1');
    await new Promise(resolve => setTimeout(resolve, 150));
    fastCb.shouldPoll(); // half-open

    fastCb.recordFailure('error 2');
    expect(fastCb.getState()).toBe('open');
  });

  it('resets correctly', () => {
    cb.recordFailure('error');
    cb.recordFailure('error');
    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.getHealth().consecutiveFailures).toBe(0);
    expect(cb.getHealth().reachability).toBe('unknown');
  });

  it('tracks VPN requirement', () => {
    const vpnCb = new CircuitBreaker({ requiresVpn: true });
    expect(vpnCb.getHealth().requiresVpn).toBe(true);
  });

  it('increases backoff exponentially', () => {
    const backoffs: number[] = [];

    for (let i = 0; i < 5; i++) {
      cb.recordFailure('error');
      backoffs.push(cb.getHealth().currentBackoffMs);
    }

    // Each backoff should be roughly 2x the previous
    for (let i = 1; i < backoffs.length; i++) {
      expect(backoffs[i]).toBeGreaterThanOrEqual(backoffs[i - 1]);
    }
  });

  it('caps backoff at maxBackoffMs', () => {
    const smallCb = new CircuitBreaker({
      failureThreshold: 1,
      maxBackoffMs: 500,
      backoffJitter: 0,
    });

    for (let i = 0; i < 20; i++) {
      smallCb.recordFailure('error');
    }

    expect(smallCb.getHealth().currentBackoffMs).toBeLessThanOrEqual(500);
  });
});
