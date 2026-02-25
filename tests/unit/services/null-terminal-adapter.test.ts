// ============================================================
// NullTerminalAdapter Tests
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { NullTerminalAdapter } from '@main/services/null-terminal-adapter';

vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('NullTerminalAdapter', () => {
  const adapter = new NullTerminalAdapter();

  it('isRunning() returns false', async () => {
    expect(await adapter.isRunning()).toBe(false);
  });

  it('listSessions() returns empty array', async () => {
    expect(await adapter.listSessions()).toEqual([]);
  });

  it('findSession() returns null', async () => {
    expect(await adapter.findSession('anything')).toBeNull();
  });

  it('focusSession() does not throw', async () => {
    await expect(adapter.focusSession({ name: 'test', windowId: 1, tabId: 1 })).resolves.toBeUndefined();
  });

  it('createTab() returns dummy session', async () => {
    const session = await adapter.createTab({ name: 'my-tab' });
    expect(session).toEqual({ name: 'my-tab', windowId: 0, tabId: 0 });
  });

  it('createTab() defaults name to "new-tab"', async () => {
    const session = await adapter.createTab({});
    expect(session.name).toBe('new-tab');
  });

  it('writeText() does not throw', async () => {
    await expect(adapter.writeText({ name: 'test', windowId: 1, tabId: 1 }, 'hello')).resolves.toBeUndefined();
  });

  it('activate() does not throw', async () => {
    await expect(adapter.activate()).resolves.toBeUndefined();
  });
});
