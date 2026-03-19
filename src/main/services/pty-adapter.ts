// ============================================================
// PtyAdapter - Cross-platform PTY terminal adapter via node-pty
// ============================================================

import type { TerminalAdapter, TerminalSession } from './terminal-adapter';
import { log, warn } from '@main/utils/log';

interface PtyProcess {
  pid: number;
  write(data: string): void;
  kill(signal?: string): void;
  onData: (callback: (data: string) => void) => { dispose(): void };
  onExit: (callback: (exitInfo: { exitCode: number; signal?: number }) => void) => { dispose(): void };
}

interface PtyModule {
  spawn(shell: string, args: string[], opts: {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  }): PtyProcess;
}

const MAX_OUTPUT_LINES = 500;

export class PtyAdapter implements TerminalAdapter {
  private sessions = new Map<string, { session: TerminalSession; pty: PtyProcess; outputBuffer: string[] }>();
  private nextId = 1;
  private ptyModule: PtyModule | null = null;

  async init(): Promise<void> {
    try {
      // Dynamic import so the app works even if node-pty is not installed
      this.ptyModule = await import('node-pty') as unknown as PtyModule;
      log('PtyAdapter', 'node-pty loaded successfully');
    } catch {
      warn('PtyAdapter', 'node-pty not available, PTY adapter will not function');
    }
  }

  async isRunning(): Promise<boolean> {
    return this.ptyModule !== null;
  }

  async listSessions(): Promise<TerminalSession[]> {
    return [...this.sessions.values()].map(s => s.session);
  }

  async findSession(name: string): Promise<TerminalSession | null> {
    for (const entry of this.sessions.values()) {
      if (entry.session.name === name) return entry.session;
    }
    return null;
  }

  async focusSession(_session: TerminalSession): Promise<void> {
    // PTY sessions don't have visual focus - no-op
  }

  async createTab(opts: { name?: string; cwd?: string; command?: string }): Promise<TerminalSession> {
    if (!this.ptyModule) throw new Error('node-pty not available');

    const id = this.nextId++;
    const sessionKey = `pty-${id}`;
    const shell = process.env.SHELL || '/bin/zsh';

    const pty = this.ptyModule.spawn(shell, opts.command ? ['-c', opts.command] : [], {
      name: opts.name || `pty-${id}`,
      cols: 120,
      rows: 30,
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env } as Record<string, string>,
    });

    const session: TerminalSession = {
      name: opts.name || `pty-${id}`,
      windowId: 0,
      tabId: id,
      sessionId: sessionKey,
      pid: pty.pid,
    };

    const entry = { session, pty, outputBuffer: [] as string[] };
    this.sessions.set(sessionKey, entry);

    // Capture output into ring buffer
    pty.onData((data: string) => {
      entry.outputBuffer.push(data);
      if (entry.outputBuffer.length > MAX_OUTPUT_LINES) {
        entry.outputBuffer = entry.outputBuffer.slice(-MAX_OUTPUT_LINES);
      }
    });

    // Clean up on exit
    pty.onExit(() => {
      log('PtyAdapter', `PTY session ${sessionKey} (${session.name}) exited`);
      this.sessions.delete(sessionKey);
    });

    log('PtyAdapter', `Created PTY session: ${session.name} (pid: ${pty.pid})`);
    return session;
  }

  async writeText(session: TerminalSession, text: string): Promise<void> {
    const entry = this.sessions.get(session.sessionId || '');
    if (!entry) throw new Error(`PTY session ${session.sessionId} not found`);
    entry.pty.write(text + '\n');
  }

  async activate(): Promise<void> {
    // No-op for PTY sessions
  }

  // --- Extended methods ---

  async terminate(session: TerminalSession): Promise<void> {
    const entry = this.sessions.get(session.sessionId || '');
    if (!entry) return;

    log('PtyAdapter', `Terminating PTY session: ${session.name}`);
    try {
      entry.pty.kill('SIGTERM');
      // Give process time to clean up, then force kill
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try { entry.pty.kill('SIGKILL'); } catch { /* already dead */ }
          resolve();
        }, 5000);
        // If session is already removed (exited), resolve immediately
        const check = setInterval(() => {
          if (!this.sessions.has(session.sessionId || '')) {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });
    } catch {
      warn('PtyAdapter', `Failed to terminate session ${session.name}`);
    }
    this.sessions.delete(session.sessionId || '');
  }

  onOutput(session: TerminalSession, callback: (data: string) => void): void {
    const entry = this.sessions.get(session.sessionId || '');
    if (!entry) return;
    entry.pty.onData(callback);
  }

  getPid(session: TerminalSession): number | undefined {
    const entry = this.sessions.get(session.sessionId || '');
    return entry?.pty.pid;
  }

  getOutput(session: TerminalSession): string[] {
    const entry = this.sessions.get(session.sessionId || '');
    return entry?.outputBuffer ?? [];
  }

  destroy(): void {
    for (const [key, entry] of this.sessions) {
      try { entry.pty.kill('SIGTERM'); } catch { /* ignore */ }
      this.sessions.delete(key);
    }
  }
}
