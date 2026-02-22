// ============================================================
// Config Schema Validation Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { appConfigSchema, connectorConfigSchema } from '@main/config/schema';

describe('appConfigSchema', () => {
  it('accepts empty object and fills defaults', () => {
    const result = appConfigSchema.parse({});
    expect(result.window.defaultMode).toBe('floating');
    expect(result.api.port).toBe(19280);
    expect(result.api.bind).toBe('127.0.0.1');
    expect(result.events.maxHistory).toBe(1000);
    expect(result.storage.retentionDays).toBe(30);
    expect(result.network.circuitBreaker.failureThreshold).toBe(5);
  });

  it('accepts partial overrides', () => {
    const result = appConfigSchema.parse({
      window: { defaultMode: 'docked', theme: 'light' },
      api: { port: 3000 },
    });
    expect(result.window.defaultMode).toBe('docked');
    expect(result.window.theme).toBe('light');
    expect(result.api.port).toBe(3000);
    // Non-overridden fields keep defaults
    expect(result.window.size.width).toBe(650);
    expect(result.api.bind).toBe('127.0.0.1');
  });

  it('validates dock position enum', () => {
    const result = appConfigSchema.parse({
      window: { dock: { position: 'top-right' } },
    });
    expect(result.window.dock.position).toBe('top-right');
  });

  it('rejects invalid dock position', () => {
    expect(() => appConfigSchema.parse({
      window: { dock: { position: 'invalid' } },
    })).toThrow();
  });

  it('validates always-on-top afterExpiry enum', () => {
    const result = appConfigSchema.parse({
      window: { alwaysOnTop: { onNotification: { afterExpiry: 'minimize' } } },
    });
    expect(result.window.alwaysOnTop.onNotification.afterExpiry).toBe('minimize');
  });

  it('rejects invalid port numbers', () => {
    expect(() => appConfigSchema.parse({
      api: { port: 0 },
    })).toThrow();

    expect(() => appConfigSchema.parse({
      api: { port: 70000 },
    })).toThrow();
  });

  it('validates opacity range', () => {
    const result = appConfigSchema.parse({ window: { opacity: 0.5 } });
    expect(result.window.opacity).toBe(0.5);

    expect(() => appConfigSchema.parse({ window: { opacity: 1.5 } })).toThrow();
  });
});

describe('connectorConfigSchema', () => {
  it('validates a minimal connector config', () => {
    const result = connectorConfigSchema.parse({
      id: 'tc-prod',
      type: 'teamcity',
      displayName: 'TeamCity Production',
    });
    expect(result.id).toBe('tc-prod');
    expect(result.enabled).toBe(true);
    expect(result.pollIntervalMs).toBe(30000);
    expect(result.auth.type).toBe('none');
  });

  it('validates a full connector config', () => {
    const result = connectorConfigSchema.parse({
      id: 'github-proj',
      type: 'github',
      displayName: 'GitHub: project',
      enabled: true,
      pollIntervalMs: 15000,
      auth: {
        type: 'pat',
        token: '${GITHUB_TOKEN}',
      },
      settings: {
        repos: ['org/repo1', 'org/repo2'],
        monitorWorkflows: true,
      },
      ui: {
        icon: 'github',
        color: '#8b5cf6',
        priority: 3,
      },
    });
    expect(result.auth.type).toBe('pat');
    expect(result.ui.icon).toBe('github');
    expect(result.ui.priority).toBe(3);
  });

  it('rejects missing required fields', () => {
    expect(() => connectorConfigSchema.parse({})).toThrow();
    expect(() => connectorConfigSchema.parse({ id: 'x' })).toThrow();
  });

  it('validates all auth types', () => {
    const authTypes = [
      'none', 'apiKey', 'basic', 'bearer', 'pat',
      'oauth-device-flow', 'oauth-authorization-code', 'webhook-secret',
    ];

    for (const type of authTypes) {
      const result = connectorConfigSchema.parse({
        id: 'test',
        type: 'test',
        displayName: 'Test',
        auth: { type },
      });
      expect(result.auth.type).toBe(type);
    }
  });
});
