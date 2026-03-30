// ============================================================
// Terminal Factory Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before importing
vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock PtyAdapter
vi.mock('@main/services/pty-adapter', () => ({
  PtyAdapter: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn().mockResolvedValue(true),
    listSessions: vi.fn().mockResolvedValue([]),
    findSession: vi.fn().mockResolvedValue(null),
    focusSession: vi.fn().mockResolvedValue(undefined),
    createTab: vi.fn().mockResolvedValue({ name: 'tab', windowId: 0, tabId: 0 }),
    writeText: vi.fn().mockResolvedValue(undefined),
    activate: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock ITerm2Adapter
vi.mock('@main/services/iterm2-adapter', () => ({
  ITerm2Adapter: vi.fn().mockImplementation(() => ({
    isRunning: vi.fn().mockResolvedValue(true),
    listSessions: vi.fn().mockResolvedValue([]),
    findSession: vi.fn().mockResolvedValue(null),
    focusSession: vi.fn().mockResolvedValue(undefined),
    createTab: vi.fn().mockResolvedValue({ name: 'tab', windowId: 0, tabId: 0 }),
    writeText: vi.fn().mockResolvedValue(undefined),
    activate: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { createTerminalAdapter } from '@main/services/terminal-factory';
import { ITerm2Adapter } from '@main/services/iterm2-adapter';
import { PtyAdapter } from '@main/services/pty-adapter';

describe('createTerminalAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ITerm2Adapter when type is iterm2 on darwin', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      const adapter = await createTerminalAdapter('iterm2');
      expect(ITerm2Adapter).toHaveBeenCalled();
      expect(adapter).toBeDefined();
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('returns PtyAdapter when type is pty', async () => {
    const adapter = await createTerminalAdapter('pty');
    expect(PtyAdapter).toHaveBeenCalled();
    expect(adapter).toBeDefined();
  });

  it('returns ITerm2Adapter for auto on darwin', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      const adapter = await createTerminalAdapter('auto');
      expect(ITerm2Adapter).toHaveBeenCalled();
      expect(adapter).toBeDefined();
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('returns PtyAdapter for auto on non-darwin', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      const adapter = await createTerminalAdapter('auto');
      expect(PtyAdapter).toHaveBeenCalled();
      expect(adapter).toBeDefined();
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('returns no-op adapter when PTY is not available on non-darwin', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    // Make PtyAdapter.isRunning return false
    const { PtyAdapter: MockPty } = await import('@main/services/pty-adapter');
    (MockPty as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockResolvedValue(false),
    }));

    try {
      const adapter = await createTerminalAdapter('auto');
      expect(await adapter.isRunning()).toBe(false);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
});
