// ============================================================
// Terminal Factory - Platform-aware adapter selection
// ============================================================

import type { TerminalAdapter } from './terminal-adapter';
import { ITerm2Adapter } from './iterm2-adapter';

export function createTerminalAdapter(): TerminalAdapter {
  if (process.platform === 'darwin') {
    return new ITerm2Adapter();
  }
  // Non-macOS: return a no-op adapter
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
