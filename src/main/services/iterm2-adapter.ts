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
    execFile('osascript', [tmpFile], (err, stdout) => {
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
      if (err) reject(new Error(err.message));
      else resolve(stdout.trim());
    });
  });
}

export class ITerm2Adapter implements TerminalAdapter {
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
        set output to output & wIdx & "," & tIdx & "," & sName & linefeed
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
        if (parts.length >= 3) {
          sessions.push({
            windowId: parseInt(parts[0]) || 0,
            tabId: parseInt(parts[1]) || 0,
            name: parts.slice(2).join(','),
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
    const escapedName = session.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await runAppleScript(`
tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if name of s contains "${escapedName}" then
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
  }

  async createTab(opts: { name?: string; cwd?: string; command?: string }): Promise<TerminalSession> {
    const cdCmd = opts.cwd ? `cd ${JSON.stringify(opts.cwd)} && ` : '';
    const fullCommand = opts.command ? `${cdCmd}${opts.command}` : (opts.cwd ? `cd ${JSON.stringify(opts.cwd)}` : '');
    const escapedCommand = fullCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    log('ITerm2Adapter', `Creating tab: command="${fullCommand}"`);

    const result = await runAppleScript(`
tell application "iTerm2"
  tell current window
    set newTab to (create tab with default profile)
    tell current session of newTab
      ${escapedCommand ? `write text "${escapedCommand}"` : ''}
    end tell
  end tell
  set wIdx to 0
  repeat with w in windows
    set wIdx to wIdx + 1
    if w is current window then
      set tCount to count of tabs of w
      return wIdx & "," & tCount
    end if
  end repeat
  return "1,1"
end tell
`);

    const parts = result.split(',');
    return {
      name: opts.name ?? 'new-tab',
      windowId: parseInt(parts[0]) || 1,
      tabId: parseInt(parts[1]) || 1,
    };
  }

  async writeText(session: TerminalSession, text: string): Promise<void> {
    const escapedName = session.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await runAppleScript(`
tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if name of s contains "${escapedName}" then
          tell s to write text "${escapedText}"
          return
        end if
      end repeat
    end repeat
  end repeat
end tell
`);
  }

  async activate(): Promise<void> {
    execFile('osascript', ['-e', 'tell application "iTerm2" to activate']);
  }
}
