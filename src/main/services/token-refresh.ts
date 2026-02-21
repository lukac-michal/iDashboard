// ============================================================
// Token Refresh Service
// Proactively refreshes OAuth tokens before they expire
// ============================================================

import type { AuthManager } from './auth-manager';
import type { ConnectorConfig } from '@shared/types';

interface TrackedToken {
  connectorId: string;
  expiresAt: number;
  refreshToken: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
}

export class TokenRefreshService {
  private tracked = new Map<string, TrackedToken>();
  private timer?: ReturnType<typeof setInterval>;
  private authManager: AuthManager;
  private refreshBufferMs = 5 * 60_000; // Refresh 5 min before expiry

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
  }

  /** Start checking for tokens that need refresh */
  start(): void {
    this.timer = setInterval(() => this.checkAndRefresh(), 60_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Track a token for proactive refresh */
  trackToken(
    connectorId: string,
    config: ConnectorConfig,
    expiresInSec: number,
    refreshToken: string,
  ): void {
    if (!config.auth.oauth?.tokenUrl || !refreshToken) return;

    this.tracked.set(connectorId, {
      connectorId,
      expiresAt: Date.now() + expiresInSec * 1000,
      refreshToken,
      tokenUrl: config.auth.oauth.tokenUrl,
      clientId: config.auth.oauth.clientId,
      clientSecret: config.auth.oauth.clientSecret,
    });
  }

  /** Remove tracking for a connector */
  untrack(connectorId: string): void {
    this.tracked.delete(connectorId);
  }

  private async checkAndRefresh(): Promise<void> {
    const now = Date.now();

    for (const [id, token] of this.tracked) {
      if (now >= token.expiresAt - this.refreshBufferMs) {
        try {
          await this.refreshToken(token);
          console.log(`[TokenRefresh] Refreshed token for ${id}`);
        } catch (err) {
          console.error(`[TokenRefresh] Failed to refresh token for ${id}:`, err);
        }
      }
    }
  }

  private async refreshToken(tracked: TrackedToken): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tracked.refreshToken,
      client_id: tracked.clientId,
    });

    if (tracked.clientSecret) {
      body.append('client_secret', tracked.clientSecret);
    }

    const response = await fetch(tracked.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    // Store new access token
    await this.authManager.storeToken(tracked.connectorId, 'access_token', data.access_token);

    // Update tracking
    if (data.refresh_token) {
      tracked.refreshToken = data.refresh_token;
      await this.authManager.storeToken(tracked.connectorId, 'refresh_token', data.refresh_token);
    }

    if (data.expires_in) {
      tracked.expiresAt = Date.now() + data.expires_in * 1000;
    }
  }
}
