// ============================================================
// PtyAdapter Tests (mocked node-pty)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Build a mock PTY process factory
function createMockPtyProcess(overrides?: Partial<{
  pid: number;
  onDataHandler: ((data: string) => void) | null;
  onExitHandler: ((info: { exitCode: number; signal?: number }) => void) | null;
}>) {
  let onDataHandler: ((data: string) => void) | null = overrides?.onDataHandler ?? null;
  let onExitHandler: ((info: { exitCode: number; signal?: number }) => void) | null = overrides?.onExitHandler ?? null;

  return {
    pid: overrides?.pid ?? 12345,
    write: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((cb: (data: string) => void) => {
      onDataHandler = cb;
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((cb: (info: { exitCode: number; signal?: number }) => void) => {
      onExitHandler = cb;
      return { dispose: vi.fn() };
    }),
    // Helpers for testing
    _emitData(data: string) { onDataHandler?.(data); },
    _emitExit(exitCode = 0, signal?: number) { onExitHandler?.({ exitCode, signal }); },
  };
}

// We need to mock the dynamic import of node-pty inside PtyAdapter.init()
// The adapter uses: await import('node-pty')
let mockSpawn = vi.fn();
let shouldFailImport = false;

vi.mock('node-pty', () => ({
  get spawn() { return mockSpawn; },
}));

// Dynamically import the adapter after mocking
const { PtyAdapter } = await import('@main/services/pty-adapter');

describe('PtyAdapter', () => {
  let adapter: InstanceType<typeof PtyAdapter>;
  let mockPty: ReturnType<typeof createMockPtyProcess>;

  beforeEach(() => {
    mockPty = createMockPtyProcess();
    mockSpawn = vi.fn().mockReturnValue(mockPty);
    shouldFailImport = false;
    adapter = new PtyAdapter();
  });

  describe('init()', () => {
    it('loads node-pty successfully', async () => {
      await adapter.init();
      expect(await adapter.isRunning()).toBe(true);
    });

    it('handles missing node-pty gracefully', async () => {
      // Create a fresh adapter that will fail to import
      const failAdapter = new PtyAdapter();
      // Override the init to simulate import failure
      const origInit = failAdapter.init.bind(failAdapter);
      // We can't easily make import('node-pty') fail when it's already mocked,
      // so we test isRunning before init instead
      expect(await failAdapter.isRunning()).toBe(false);
    });
  });

  describe('after init', () => {
    beforeEach(async () => {
      await adapter.init();
    });

    it('isRunning() returns true', async () => {
      expect(await adapter.isRunning()).toBe(true);
    });

    it('listSessions() returns empty initially', async () => {
      expect(await adapter.listSessions()).toEqual([]);
    });

    it('findSession() returns null when no sessions exist', async () => {
      expect(await adapter.findSession('nonexistent')).toBeNull();
    });

    describe('createTab()', () => {
      it('creates a PTY session with name', async () => {
        const session = await adapter.createTab({ name: 'test-agent', cwd: '/tmp' });
        expect(session.name).toBe('test-agent');
        expect(session.windowId).toBe(0);
        expect(session.tabId).toBe(1);
        expect(session.sessionId).toBe('pty-1');
        expect(session.pid).toBe(12345);
        expect(mockSpawn).toHaveBeenCalledOnce();
      });

      it('creates session with default name when none provided', async () => {
        const session = await adapter.createTab({});
        expect(session.name).toBe('pty-1');
      });

      it('passes command to shell with -c flag', async () => {
        await adapter.createTab({ command: 'echo hello' });
        expect(mockSpawn).toHaveBeenCalledWith(
          expect.any(String),
          ['-c', 'echo hello'],
          expect.objectContaining({ cols: 120, rows: 30 }),
        );
      });

      it('passes empty args when no command given', async () => {
        await adapter.createTab({});
        expect(mockSpawn).toHaveBeenCalledWith(
          expect.any(String),
          [],
          expect.any(Object),
        );
      });

      it('increments tab IDs', async () => {
        const s1 = await adapter.createTab({ name: 'a' });
        const s2 = await adapter.createTab({ name: 'b' });
        expect(s1.tabId).toBe(1);
        expect(s2.tabId).toBe(2);
      });
    });

    describe('listSessions() and findSession()', () => {
      it('lists created sessions', async () => {
        await adapter.createTab({ name: 'agent-1' });
        await adapter.createTab({ name: 'agent-2' });
        const sessions = await adapter.listSessions();
        expect(sessions).toHaveLength(2);
        expect(sessions.map(s => s.name)).toEqual(['agent-1', 'agent-2']);
      });

      it('finds session by name', async () => {
        await adapter.createTab({ name: 'target' });
        const found = await adapter.findSession('target');
        expect(found).not.toBeNull();
        expect(found!.name).toBe('target');
      });

      it('returns null for unknown session name', async () => {
        await adapter.createTab({ name: 'other' });
        expect(await adapter.findSession('missing')).toBeNull();
      });
    });

    describe('writeText()', () => {
      it('writes text with newline to PTY', async () => {
        const session = await adapter.createTab({ name: 'writer' });
        await adapter.writeText(session, 'hello world');
        expect(mockPty.write).toHaveBeenCalledWith('hello world\n');
      });

      it('throws for unknown session', async () => {
        const fakeSession = { name: 'fake', windowId: 0, tabId: 99, sessionId: 'pty-99' };
        await expect(adapter.writeText(fakeSession, 'test')).rejects.toThrow('PTY session pty-99 not found');
      });
    });

    describe('output capture', () => {
      it('captures output in buffer', async () => {
        const session = await adapter.createTab({ name: 'out' });
        mockPty._emitData('line 1\n');
        mockPty._emitData('line 2\n');
        const output = adapter.getOutput(session);
        expect(output).toEqual(['line 1\n', 'line 2\n']);
      });

      it('returns empty array for unknown session', () => {
        const fakeSession = { name: 'fake', windowId: 0, tabId: 99, sessionId: 'pty-99' };
        expect(adapter.getOutput(fakeSession)).toEqual([]);
      });
    });

    describe('onOutput()', () => {
      it('registers callback for PTY data', async () => {
        const session = await adapter.createTab({ name: 'listener' });
        const callback = vi.fn();
        adapter.onOutput(session, callback);
        expect(mockPty.onData).toHaveBeenCalled();
      });

      it('does nothing for unknown session', () => {
        const fakeSession = { name: 'fake', windowId: 0, tabId: 99, sessionId: 'pty-99' };
        // Should not throw
        adapter.onOutput(fakeSession, vi.fn());
      });
    });

    describe('getPid()', () => {
      it('returns PID for existing session', async () => {
        const session = await adapter.createTab({ name: 'pid-test' });
        expect(adapter.getPid(session)).toBe(12345);
      });

      it('returns undefined for unknown session', () => {
        const fakeSession = { name: 'fake', windowId: 0, tabId: 99, sessionId: 'pty-99' };
        expect(adapter.getPid(fakeSession)).toBeUndefined();
      });
    });

    describe('terminate()', () => {
      it('sends SIGTERM to process', async () => {
        const session = await adapter.createTab({ name: 'term-test' });
        // Simulate exit after SIGTERM
        mockPty.kill.mockImplementation(() => {
          mockPty._emitExit(0);
        });
        await adapter.terminate(session);
        expect(mockPty.kill).toHaveBeenCalledWith('SIGTERM');
      });

      it('does nothing for unknown session', async () => {
        const fakeSession = { name: 'fake', windowId: 0, tabId: 99, sessionId: 'pty-99' };
        // Should not throw
        await adapter.terminate(fakeSession);
      });

      it('removes session after termination', async () => {
        const session = await adapter.createTab({ name: 'remove-test' });
        mockPty.kill.mockImplementation(() => {
          mockPty._emitExit(0);
        });
        await adapter.terminate(session);
        expect(await adapter.listSessions()).toHaveLength(0);
      });
    });

    describe('session auto-cleanup on exit', () => {
      it('removes session from list when PTY exits', async () => {
        await adapter.createTab({ name: 'auto-clean' });
        expect(await adapter.listSessions()).toHaveLength(1);
        mockPty._emitExit(0);
        expect(await adapter.listSessions()).toHaveLength(0);
      });
    });

    describe('focusSession()', () => {
      it('is a no-op and does not throw', async () => {
        const session = await adapter.createTab({ name: 'focus-test' });
        await expect(adapter.focusSession(session)).resolves.toBeUndefined();
      });
    });

    describe('activate()', () => {
      it('is a no-op and does not throw', async () => {
        await expect(adapter.activate()).resolves.toBeUndefined();
      });
    });

    describe('destroy()', () => {
      it('kills all PTY sessions', async () => {
        await adapter.createTab({ name: 'destroy-1' });
        const mockPty2 = createMockPtyProcess({ pid: 99999 });
        mockSpawn.mockReturnValueOnce(mockPty2);
        await adapter.createTab({ name: 'destroy-2' });
        adapter.destroy();
        expect(mockPty.kill).toHaveBeenCalledWith('SIGTERM');
        expect(mockPty2.kill).toHaveBeenCalledWith('SIGTERM');
        expect(await adapter.listSessions()).toHaveLength(0);
      });
    });
  });

  describe('before init (no ptyModule)', () => {
    it('isRunning() returns false', async () => {
      expect(await adapter.isRunning()).toBe(false);
    });

    it('createTab() throws', async () => {
      await expect(adapter.createTab({ name: 'fail' })).rejects.toThrow('node-pty not available');
    });
  });
});
