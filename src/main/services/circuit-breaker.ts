// ============================================================
// Circuit Breaker - Per-connector health tracking with backoff
// ============================================================

import { CIRCUIT_BREAKER_DEFAULTS } from '@shared/constants';
import type { CircuitState, ConnectorHealth, EndpointReachability } from '@shared/types';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  halfOpenRetryMs: number;
  maxBackoffMs: number;
  backoffJitter: number;
  requiresVpn?: boolean;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private currentBackoffMs: number;
  private lastSuccessAt?: number;
  private lastFailureAt?: number;
  private lastError?: string;
  private lastLatencyMs?: number;
  private reachability: EndpointReachability = 'unknown';
  private nextPollAt?: number;

  private config: Required<CircuitBreakerConfig>;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? CIRCUIT_BREAKER_DEFAULTS.failureThreshold,
      halfOpenRetryMs: config?.halfOpenRetryMs ?? CIRCUIT_BREAKER_DEFAULTS.halfOpenRetryMs,
      maxBackoffMs: config?.maxBackoffMs ?? CIRCUIT_BREAKER_DEFAULTS.maxBackoffMs,
      backoffJitter: config?.backoffJitter ?? CIRCUIT_BREAKER_DEFAULTS.backoffJitter,
      requiresVpn: config?.requiresVpn ?? false,
    };
    this.currentBackoffMs = CIRCUIT_BREAKER_DEFAULTS.initialBackoffMs;
  }

  /** Record a successful poll */
  recordSuccess(latencyMs?: number): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.currentBackoffMs = CIRCUIT_BREAKER_DEFAULTS.initialBackoffMs;
    this.lastSuccessAt = Date.now();
    this.reachability = 'reachable';
    this.lastLatencyMs = latencyMs;
    this.nextPollAt = undefined;
  }

  /** Record a failed poll */
  recordFailure(error: string, reachability?: EndpointReachability): void {
    this.consecutiveFailures++;
    this.lastFailureAt = Date.now();
    this.lastError = error;
    this.reachability = reachability ?? 'http-failed';

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = 'open';
    }

    // Exponential backoff with jitter
    this.currentBackoffMs = Math.min(
      this.currentBackoffMs * 2,
      this.config.maxBackoffMs,
    );
    const jitter = 1 + (Math.random() * 2 - 1) * this.config.backoffJitter;
    const backoff = Math.round(this.currentBackoffMs * jitter);
    this.nextPollAt = Date.now() + backoff;
  }

  /** Check if a poll should be attempted */
  shouldPoll(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      // Check if enough time has passed for a half-open probe
      if (this.nextPollAt && Date.now() >= this.nextPollAt) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }

    // half-open: allow one probe
    return true;
  }

  /** Get the current health status */
  getHealth(): ConnectorHealth {
    return {
      reachability: this.reachability,
      circuitState: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastError: this.lastError,
      currentBackoffMs: this.currentBackoffMs,
      nextPollAt: this.nextPollAt,
      latencyMs: this.lastLatencyMs,
      requiresVpn: this.config.requiresVpn,
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  /** Reset to initial state */
  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.currentBackoffMs = CIRCUIT_BREAKER_DEFAULTS.initialBackoffMs;
    this.reachability = 'unknown';
    this.nextPollAt = undefined;
  }
}
