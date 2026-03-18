// ============================================================
// TerminalAdapter - Abstract interface for terminal emulators
// ============================================================

export interface TerminalSession {
  name: string;
  windowId: number;
  tabId: number;
  /** iTerm2 unique session identifier (e.g. "w0t3p0:UUID") */
  sessionId?: string;
}

export interface TerminalAdapter {
  isRunning(): Promise<boolean>;
  listSessions(): Promise<TerminalSession[]>;
  findSession(name: string): Promise<TerminalSession | null>;
  focusSession(session: TerminalSession): Promise<void>;
  createTab(opts: { name?: string; cwd?: string; command?: string }): Promise<TerminalSession>;
  writeText(session: TerminalSession, text: string): Promise<void>;
  activate(): Promise<void>;
}
