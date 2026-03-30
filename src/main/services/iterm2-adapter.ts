// ============================================================
// ITerm2Adapter - iTerm2 terminal adapter via AppleScript
// ============================================================

import { execFile } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { log, warn } from '@main/utils/log';
import type { TerminalAdapter, TerminalSession } from './terminal-adapter';

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `iterm2-adapter-${Date.now()}.scpt`);
    try {
      writeFileSync(tmpFile, script);
    } catch (e) {
      reject(new Error(`Failed to write temp script: ${(e as Error).message}`));
      return;
    }
    execFile('osascript', [tmpFile], (err, stdout, stderr) => {
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
      if (err) {
        warn('ITerm2Adapter', `AppleScript error: ${stderr || err.message}`);
        reject(new Error(err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export class ITerm2Adapter implements TerminalAdapter {
  private agentWindowId: string | null = null;

  async isRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      const script = 'tell application "System Events" to (name of every process) contains "iTerm2"';
      execFile('osascript', ['-e', script], (err, stdout) => {
        resolve(!err && stdout.trim() === 'true');
      });
    });
  }

  async listSessions(): Promise<TerminalSession[]> {
    try {
      const result = await runAppleScript(`
tell application "iTerm2"
  set output to ""
  set wIdx to 0
  repeat with w in windows
    set wIdx to wIdx + 1
    set tIdx to 0
    repeat with t in tabs of w
      set tIdx to tIdx + 1
      repeat with s in sessions of t
        set sName to name of s
        set sId to unique ID of s
        set output to output & wIdx & "," & tIdx & "," & sId & "," & sName & linefeed
      end repeat
    end repeat
  end repeat
  return output
end tell
`);
      const sessions: TerminalSession[] = [];
      for (const line of result.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(',');
        if (parts.length >= 4) {
          sessions.push({
            windowId: parseInt(parts[0]) || 0,
            tabId: parseInt(parts[1]) || 0,
            sessionId: parts[2],
            name: parts.slice(3).join(','),
          });
        }
      }
      return sessions;
    } catch (e) {
      warn('ITerm2Adapter', 'listSessions failed:', (e as Error).message);
      return [];
    }
  }

  async findSession(name: string): Promise<TerminalSession | null> {
    const sessions = await this.listSessions();
    return sessions.find(s => s.name.includes(name)) ?? null;
  }

  async focusSession(session: TerminalSession): Promise<void> {
    if (!session.sessionId) {
      warn('ITerm2Adapter', 'focusSession: no sessionId');
      return;
    }
    try {
      await runAppleScript(`
tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if unique ID of s is "${session.sessionId}" then
          select t
          tell w to select
          activate
          return
        end if
      end repeat
    end repeat
  end repeat
end tell
`);
    } catch (e) {
      warn('ITerm2Adapter', `focusSession failed: ${(e as Error).message}`);
    }
  }

  async createTab(opts: { name?: string; cwd?: string; command?: string }): Promise<TerminalSession> {
    const cdCmd = opts.cwd ? `cd ${JSON.stringify(opts.cwd)} && ` : '';
    const fullCommand = opts.command ? `${cdCmd}${opts.command}` : (opts.cwd ? `cd ${JSON.stringify(opts.cwd)}` : '');
    const escapedCommand = fullCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapedName = (opts.name ?? 'agent').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    log('ITerm2Adapter', `Creating tab: command="${fullCommand}"`);

    // Use a dedicated "iDashboard Agents" window — create it on first spawn, reuse after
    let result: string;
    if (!this.agentWindowId) {
      // Create a new window for the first agent
      result = await runAppleScript(`
tell application "iTerm2"
  set newWin to (create window with default profile)
  set newSession to current session of current tab of newWin
  tell newSession to set name to "${escapedName}"
  ${escapedCommand ? `tell newSession to write text "${escapedCommand}"` : ''}
  set sId to unique ID of newSession
  return (id of newWin as text) & "|" & sId
end tell
`);
      const parts = result.split('|');
      this.agentWindowId = parts[0];
      result = parts[1] || parts[0];
      log('ITerm2Adapter', `Created agent window (id=${this.agentWindowId}), sessionId=${result}`);
    } else {
      // Create a new tab in the existing agent window
      result = await runAppleScript(`
tell application "iTerm2"
  set agentWin to missing value
  repeat with w in windows
    if (id of w as text) is "${this.agentWindowId}" then
      set agentWin to w
      exit repeat
    end if
  end repeat
  if agentWin is missing value then
    -- Window was closed, create a new one
    set agentWin to (create window with default profile)
    set newSession to current session of current tab of agentWin
    tell newSession to set name to "${escapedName}"
    ${escapedCommand ? `tell newSession to write text "${escapedCommand}"` : ''}
    set sId to unique ID of newSession
    return (id of agentWin as text) & "|" & sId
  else
    tell agentWin
      set newTab to (create tab with default profile)
      set newSession to current session of newTab
      tell newSession to set name to "${escapedName}"
      ${escapedCommand ? `tell newSession to write text "${escapedCommand}"` : ''}
      set sId to unique ID of newSession
    end tell
    return (id of agentWin as text) & "|" & sId
  end if
end tell
`);
      const parts = result.split('|');
      this.agentWindowId = parts[0]; // Update in case window was recreated
      result = parts[1] || parts[0];
      log('ITerm2Adapter', `Created tab in agent window, sessionId=${result}`);
    }

    return {
      name: opts.name ?? 'new-tab',
      windowId: 0,
      tabId: 0,
      sessionId: result,
    };
  }

  async writeText(session: TerminalSession, text: string): Promise<void> {
    if (!session.sessionId) {
      warn('ITerm2Adapter', 'writeText: no sessionId');
      return;
    }
    const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    log('ITerm2Adapter', `writeText to session ${session.sessionId}: "${text.slice(0, 60)}..."`);
    try {
      await runAppleScript(`
tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if unique ID of s is "${session.sessionId}" then
          tell s to write text "${escapedText}"
          delay 0.2
          tell s to write text ""
          return "ok"
        end if
      end repeat
    end repeat
  end repeat
  return "not_found"
end tell
`);
    } catch (e) {
      warn('ITerm2Adapter', `writeText failed: ${(e as Error).message}`);
    }
  }

  async activate(): Promise<void> {
    execFile('osascript', ['-e', 'tell application "iTerm2" to activate']);
  }
}
