// ============================================================
// Terminal Factory - Platform-aware adapter selection
// ============================================================

import type { TerminalAdapter } from './terminal-adapter';
import { ITerm2Adapter } from './iterm2-adapter';
import { PtyAdapter } from './pty-adapter';

export type TerminalAdapterType = 'pty' | 'iterm2' | 'auto';

export async function createTerminalAdapter(type: TerminalAdapterType = 'auto'): Promise<TerminalAdapter> {
  if (type === 'iterm2' && process.platform === 'darwin') {
    return new ITerm2Adapter();
  }

  if (type === 'pty' || type === 'auto') {
    const pty = new PtyAdapter();
    await pty.init();
    if (await pty.isRunning()) {
      return pty;
    }
    // Fallback: on macOS try iTerm2, otherwise no-op
    if (process.platform === 'darwin') {
      return new ITerm2Adapter();
    }
  }

  // No-op adapter as last resort
  return {
    isRunning: async () => false,
    listSessions: async () => [],
    findSession: async () => null,
    focusSession: async () => {},
    createTab: async (opts) => ({ name: opts.name ?? 'tab', windowId: 0, tabId: 0 }),
    writeText: async () => {},
    activate: async () => {},
  };
}
