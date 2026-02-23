// ============================================================
// Experimental Config Validation Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { appConfigSchema } from '@main/config/schema';

describe('experimental config', () => {
  it('fills defaults when experimental is omitted', () => {
    const result = appConfigSchema.parse({});
    expect(result.experimental.enabled).toBe(false);
    expect(result.experimental.prompt).toBe('');
    expect(result.experimental.pmProfile).toBe('');
    expect(result.experimental.repoPath).toBe('');
    expect(result.experimental.agentProfilesDir).toBe('');
    expect(result.experimental.healthCheckIntervalMs).toBe(10000);
  });

  it('accepts partial experimental overrides', () => {
    const result = appConfigSchema.parse({
      experimental: { enabled: true, repoPath: '/tmp/repo' },
    });
    expect(result.experimental.enabled).toBe(true);
    expect(result.experimental.repoPath).toBe('/tmp/repo');
    expect(result.experimental.prompt).toBe('');
    expect(result.experimental.healthCheckIntervalMs).toBe(10000);
  });

  it('accepts full experimental config', () => {
    const result = appConfigSchema.parse({
      experimental: {
        enabled: true,
        prompt: 'You are the master agent.',
        pmProfile: '# PM\nManage tasks.',
        repoPath: '/home/user/project',
        agentProfilesDir: '.claude/agents/',
        healthCheckIntervalMs: 5000,
      },
    });
    expect(result.experimental.enabled).toBe(true);
    expect(result.experimental.prompt).toBe('You are the master agent.');
    expect(result.experimental.pmProfile).toBe('# PM\nManage tasks.');
    expect(result.experimental.repoPath).toBe('/home/user/project');
    expect(result.experimental.agentProfilesDir).toBe('.claude/agents/');
    expect(result.experimental.healthCheckIntervalMs).toBe(5000);
  });

  it('rejects healthCheckIntervalMs below 1000', () => {
    expect(() => appConfigSchema.parse({
      experimental: { healthCheckIntervalMs: 500 },
    })).toThrow();
  });

  it('does not affect other config sections', () => {
    const result = appConfigSchema.parse({
      experimental: { enabled: true },
    });
    expect(result.debug.enabled).toBe(false);
    expect(result.api.port).toBe(19280);
    expect(result.window.defaultMode).toBe('floating');
  });
});
