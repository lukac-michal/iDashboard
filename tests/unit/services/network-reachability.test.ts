// ============================================================
// Network Reachability Service Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkReachabilityService } from '@main/services/network-reachability';
import type { ConnectorHealth } from '@shared/types';

function makeHealth(overrides: Partial<ConnectorHealth> = {}): ConnectorHealth {
  return {
    reachability: 'reachable',
    circuitState: 'closed',
    consecutiveFailures: 0,
    currentBackoffMs: 0,
    requiresVpn: false,
    ...overrides,
  };
}

describe('NetworkReachabilityService', () => {
  let service: NetworkReachabilityService;

  beforeEach(() => {
    service = new NetworkReachabilityService();
    service.initialize(true);
  });

  it('starts online', () => {
    expect(service.isOnline).toBe(true);
  });

  it('tracks online/offline state', () => {
    service.setOnline(false);
    expect(service.isOnline).toBe(false);

    service.setOnline(true);
    expect(service.isOnline).toBe(true);
  });

  it('fires onChange when going offline', () => {
    let called = false;
    service.onChange(() => { called = true; });

    service.setOnline(false);
    expect(called).toBe(true);
  });

  it('does not fire onChange when state unchanged', () => {
    let callCount = 0;
    service.onChange(() => { callCount++; });

    service.setOnline(true); // already online
    expect(callCount).toBe(0);
  });

  describe('getOverallState', () => {
    it('returns offline when system is offline', () => {
      service.setOnline(false);
      const state = service.getOverallState(new Map());
      expect(state).toBe('offline');
    });

    it('returns online when all healthy', () => {
      const map = new Map([
        ['tc', makeHealth()],
        ['octo', makeHealth()],
      ]);
      expect(service.getOverallState(map)).toBe('online');
    });

    it('returns degraded when some circuits are open', () => {
      const map = new Map([
        ['tc', makeHealth()],
        ['octo', makeHealth({ circuitState: 'open' })],
      ]);
      expect(service.getOverallState(map)).toBe('degraded');
    });

    it('returns vpn-disconnected when VPN connectors fail without VPN', () => {
      const map = new Map([
        ['tc', makeHealth({ requiresVpn: true, reachability: 'dns-failed' })],
      ]);
      // VPN not detected
      expect(service.getOverallState(map)).toBe('vpn-disconnected');
    });
  });
});
