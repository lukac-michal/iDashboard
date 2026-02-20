// ============================================================
// Auth Manager
// Token storage (safeStorage), env var resolution, OAuth flows
// ============================================================

import type { AuthConfig } from '@shared/types';

export interface ResolvedCredentials {
  type: AuthConfig['type'];
  headers: Record<string, string>;
  token?: string;
}

// In-memory token store (in production, uses Electron safeStorage)
// This abstraction allows testing without Electron runtime
const tokenStore = new Map<string, string>();

export class AuthManager {
  private safeStorage: { encryptString: (s: string) => Buffer; decryptString: (b: Buffer) => string; isEncryptionAvailable: () => boolean } | null = null;
  private encryptedStore = new Map<string, Buffer>();

  /** Set Electron safeStorage when available */
  setSafeStorage(storage: typeof this.safeStorage): void {
    this.safeStorage = storage;

    // Migrate any in-memory tokens to encrypted storage
    if (storage?.isEncryptionAvailable()) {
      for (const [key, value] of tokenStore) {
        this.encryptedStore.set(key, storage.encryptString(value));
        tokenStore.delete(key);
      }
    }
  }

  /** Store a token securely */
  async storeToken(connectorId: string, key: string, value: string): Promise<void> {
    const storeKey = `${connectorId}/${key}`;

    if (this.safeStorage?.isEncryptionAvailable()) {
      this.encryptedStore.set(storeKey, this.safeStorage.encryptString(value));
    } else {
      tokenStore.set(storeKey, value);
    }
  }

  /** Retrieve a stored token */
  async getToken(connectorId: string, key: string): Promise<string | null> {
    const storeKey = `${connectorId}/${key}`;

    if (this.safeStorage?.isEncryptionAvailable()) {
      const encrypted = this.encryptedStore.get(storeKey);
      return encrypted ? this.safeStorage.decryptString(encrypted) : null;
    }

    return tokenStore.get(storeKey) ?? null;
  }

  /** Resolve auth config to actual HTTP credentials */
  async resolveCredentials(config: AuthConfig, connectorId?: string): Promise<ResolvedCredentials> {
    const headers: Record<string, string> = {};

    switch (config.type) {
      case 'none':
        return { type: 'none', headers };

      case 'apiKey': {
        const key = this.resolveValue(config.token ?? '');
        if (config.headerName) {
          headers[config.headerName] = key;
        } else if (config.paramName) {
          // Param handled at request level, just pass token
          return { type: 'apiKey', headers, token: key };
        }
        return { type: 'apiKey', headers };
      }

      case 'bearer':
      case 'pat': {
        const token = this.resolveValue(config.token ?? '');
        headers['Authorization'] = `Bearer ${token}`;
        return { type: config.type, headers, token };
      }

      case 'basic': {
        const username = this.resolveValue(config.username ?? '');
        const password = this.resolveValue(config.password ?? '');
        const encoded = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
        return { type: 'basic', headers };
      }

      case 'oauth-device-flow':
      case 'oauth-authorization-code': {
        // Try to get stored token
        if (connectorId) {
          const token = await this.getToken(connectorId, 'access_token');
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            return { type: config.type, headers, token };
          }
        }
        return { type: config.type, headers };
      }

      case 'webhook-secret':
        // Webhook secrets are used for verification, not as headers
        return { type: 'webhook-secret', headers, token: this.resolveValue(config.secret ?? '') };

      default:
        return { type: 'none', headers };
    }
  }

  /** Revoke and clear stored tokens */
  async revokeToken(connectorId: string): Promise<void> {
    const prefix = `${connectorId}/`;

    for (const key of this.encryptedStore.keys()) {
      if (key.startsWith(prefix)) this.encryptedStore.delete(key);
    }

    for (const key of tokenStore.keys()) {
      if (key.startsWith(prefix)) tokenStore.delete(key);
    }
  }

  /** Resolve ${ENV_VAR} patterns or @keychain: references */
  private resolveValue(value: string): string {
    if (!value) return '';

    // Environment variable substitution
    return value.replace(/\$\{(\w+)\}/g, (_, varName) => {
      return process.env[varName] ?? '';
    });
  }
}
