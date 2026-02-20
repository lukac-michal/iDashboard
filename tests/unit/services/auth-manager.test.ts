// ============================================================
// Auth Manager Tests
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthManager } from '@main/services/auth-manager';

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager();
  });

  it('stores and retrieves tokens', async () => {
    await authManager.storeToken('tc-prod', 'access_token', 'my-secret-token');
    const token = await authManager.getToken('tc-prod', 'access_token');
    expect(token).toBe('my-secret-token');
  });

  it('returns null for missing tokens', async () => {
    const token = await authManager.getToken('nonexistent', 'key');
    expect(token).toBeNull();
  });

  it('revokes tokens', async () => {
    await authManager.storeToken('tc-prod', 'access_token', 'token1');
    await authManager.storeToken('tc-prod', 'refresh_token', 'token2');
    await authManager.revokeToken('tc-prod');

    expect(await authManager.getToken('tc-prod', 'access_token')).toBeNull();
    expect(await authManager.getToken('tc-prod', 'refresh_token')).toBeNull();
  });

  describe('resolveCredentials', () => {
    it('returns empty headers for none auth', async () => {
      const creds = await authManager.resolveCredentials({ type: 'none' });
      expect(creds.type).toBe('none');
      expect(Object.keys(creds.headers)).toHaveLength(0);
    });

    it('resolves bearer token', async () => {
      const creds = await authManager.resolveCredentials({
        type: 'bearer',
        token: 'my-token',
      });
      expect(creds.headers['Authorization']).toBe('Bearer my-token');
    });

    it('resolves basic auth', async () => {
      const creds = await authManager.resolveCredentials({
        type: 'basic',
        username: 'user',
        password: 'pass',
      });
      const expected = Buffer.from('user:pass').toString('base64');
      expect(creds.headers['Authorization']).toBe(`Basic ${expected}`);
    });

    it('resolves apiKey with custom header', async () => {
      const creds = await authManager.resolveCredentials({
        type: 'apiKey',
        token: 'api-key-123',
        headerName: 'X-Octopus-ApiKey',
      });
      expect(creds.headers['X-Octopus-ApiKey']).toBe('api-key-123');
    });

    it('resolves env variables in tokens', async () => {
      process.env.TEST_TOKEN_12345 = 'resolved-token';
      const creds = await authManager.resolveCredentials({
        type: 'bearer',
        token: '${TEST_TOKEN_12345}',
      });
      expect(creds.headers['Authorization']).toBe('Bearer resolved-token');
      delete process.env.TEST_TOKEN_12345;
    });

    it('resolves webhook-secret', async () => {
      const creds = await authManager.resolveCredentials({
        type: 'webhook-secret',
        secret: 'my-webhook-secret',
      });
      expect(creds.token).toBe('my-webhook-secret');
    });
  });
});
