// ============================================================
// Terminal Factory - Platform-aware adapter selection
// ============================================================

import type { TerminalAdapter } from './terminal-adapter';

export function createTerminalAdapter(): TerminalAdapter {
  if (process.platform === 'darwin') {
    // Dynamic require so iterm2-adapter.ts is never loaded on non-macOS
    const { ITerm2Adapter } = require('./iterm2-adapter');
    return new ITerm2Adapter();
  }
  const { NullTerminalAdapter } = require('./null-terminal-adapter');
  return new NullTerminalAdapter();
}
