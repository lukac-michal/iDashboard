// ============================================================
// Network Reachability Service
// Layered detection: L0 Interface, L1 VPN, L2 DNS
// ============================================================

import * as os from 'node:os';
import * as dns from 'node:dns';
import { VPN_INTERFACE_PATTERNS } from '@shared/constants';
import type { ConnectorHealth, ReachabilityState } from '@shared/types';

export class NetworkReachabilityService {
  private _isSystemOnline = true;
  private _vpnDetected = false;
  private vpnCheckInterval?: ReturnType<typeof setInterval>;
  private onChangeCallbacks: Array<() => void> = [];

  get isOnline(): boolean {
    return this._isSystemOnline;
  }

  get vpnDetected(): boolean {
    return this._vpnDetected;
  }

  initialize(isOnline: boolean): void {
    this._isSystemOnline = isOnline;
    this.checkVpnInterfaces();
  }

  startVpnPolling(intervalMs: number = 30_000): void {
    this.checkVpnInterfaces();
    this.vpnCheckInterval = setInterval(() => this.checkVpnInterfaces(), intervalMs);
  }

  stop(): void {
    if (this.vpnCheckInterval) {
      clearInterval(this.vpnCheckInterval);
      this.vpnCheckInterval = undefined;
    }
  }

  setOnline(online: boolean): void {
    const changed = this._isSystemOnline !== online;
    this._isSystemOnline = online;
    if (changed) this.notifyChange();
  }

  onChange(callback: () => void): void {
    this.onChangeCallbacks.push(callback);
  }

  /** L1: Detect VPN tunnel interfaces */
  checkVpnInterfaces(): boolean {
    const interfaces = os.networkInterfaces();
    const previousVpnState = this._vpnDetected;

    this._vpnDetected = Object.entries(interfaces).some(([name, addrs]) => {
      if (!addrs) return false;
      if (!VPN_INTERFACE_PATTERNS.test(name)) return false;
      // Filter out macOS system utun (iCloud relay) — only count routable IPv4
      return addrs.some(a =>
        a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'),
      );
    });

    if (previousVpnState !== this._vpnDetected) {
      this.notifyChange();
    }

    return this._vpnDetected;
  }

  /** L2: DNS reachability check for a hostname */
  async checkDns(hostname: string, timeoutMs: number = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      dns.resolve(hostname, (err) => {
        clearTimeout(timer);
        resolve(!err);
      });
    });
  }

  /** Compute overall reachability state from connector health data */
  getOverallState(connectorHealths: Map<string, ConnectorHealth>): ReachabilityState {
    if (!this._isSystemOnline) return 'offline';

    const healths = [...connectorHealths.values()];

    // Check VPN-dependent connectors
    const vpnRequired = healths.filter(h => h.requiresVpn);
    if (!this._vpnDetected && vpnRequired.some(h => h.reachability !== 'reachable')) {
      return 'vpn-disconnected';
    }

    // Check for any open circuits
    if (healths.some(h => h.circuitState === 'open')) {
      return 'degraded';
    }

    return 'online';
  }

  private notifyChange(): void {
    for (const cb of this.onChangeCallbacks) {
      try { cb(); } catch (e) { console.error('[Network] Change callback error:', e); }
    }
  }
}
