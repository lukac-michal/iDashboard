// ============================================================
// NullTerminalAdapter - Safe no-op adapter for non-macOS platforms
// ============================================================

import { log } from '@main/utils/log';
import type { TerminalAdapter, TerminalSession } from './terminal-adapter';

export class NullTerminalAdapter implements TerminalAdapter {
  constructor() {
    log('NullTerminalAdapter', `Terminal integration not available on ${process.platform}`);
  }

  async isRunning(): Promise<boolean> {
    return false;
  }

  async listSessions(): Promise<TerminalSession[]> {
    return [];
  }

  async findSession(_name: string): Promise<TerminalSession | null> {
    return null;
  }

  async focusSession(_session: TerminalSession): Promise<void> {}

  async createTab(opts: { name?: string; cwd?: string; command?: string }): Promise<TerminalSession> {
    return { name: opts.name ?? 'new-tab', windowId: 0, tabId: 0 };
  }

  async writeText(_session: TerminalSession, _text: string): Promise<void> {}

  async activate(): Promise<void> {}
}
