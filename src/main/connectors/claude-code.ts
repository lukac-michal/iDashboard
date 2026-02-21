// ============================================================
// Claude Code Connector
// Push-based: receives events from Claude Code hooks via local API
// ============================================================

import { execFile, execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BaseConnector } from './base';
import { DEFAULT_BLINK_DURATION } from '@shared/constants';
import { log, warn } from '@main/utils/log';
import type {
  ConnectorCapability,
  ConnectorEvent,
  ConnectorAction,
  PushEventRequest,
} from '@shared/types';

export class ClaudeCodeConnector extends BaseConnector {
  readonly type = 'claude-code';
  readonly capabilities: ConnectorCapability[] = ['push', 'action'];

  private activeSessions = new Map<string, { lastEvent: number; status: string }>();

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);
    this.status.connected = true; // Push connector is always "connected"
  }

  normalizeInbound(rawEvent: unknown): ConnectorEvent {
    const req = rawEvent as PushEventRequest;
    const eventType = req.event ?? 'notification';
    const sessionId = req.session ?? 'unknown';
    const message = req.message ?? req.body ?? '';

    this.activeSessions.set(sessionId, {
      lastEvent: Date.now(),
      status: eventType,
    });

    const blinkDuration =
      req.uiHints?.blinkDurationMs ??
      (this.config.settings.blinkDurationMs as number | undefined) ??
      DEFAULT_BLINK_DURATION;

    switch (eventType) {
      case 'needs-input':
        return this.createEvent({
          severity: 'attention',
          title: `Claude Code: ${sessionId}`,
          body: message || 'Waiting for your input',
          category: 'notification',
          eventType: 'needs-input',
          metadata: { sessionId, eventType },
          uiHints: {
            icon: 'terminal',
            color: '#f97316',
            blinkDurationMs: blinkDuration,
            actionButtons: [
              { id: 'focus', label: 'Focus Terminal', icon: 'external-link', variant: 'primary' },
            ],
          },
        });

      case 'task-complete':
        return this.createEvent({
          severity: 'info',
          title: `Claude Code: ${sessionId}`,
          body: 'Task completed',
          category: 'notification',
          eventType: 'task-complete',
          metadata: { sessionId, eventType },
          uiHints: {
            icon: 'check-circle',
            color: '#22c55e',
            blinkDurationMs: blinkDuration,
            actionButtons: [
              { id: 'focus', label: 'Focus Terminal', icon: 'external-link', variant: 'primary' },
            ],
          },
        });

      default: {
        const severity = req.severity ?? 'info';
        return this.createEvent({
          severity,
          title: req.title ?? `Claude Code: ${sessionId}`,
          body: message,
          category: 'notification',
          eventType,
          metadata: { sessionId, eventType },
          uiHints: req.uiHints ?? {
            icon: 'terminal',
            color: '#f97316',
            blinkDurationMs: blinkDuration,
            actionButtons: [
              { id: 'focus', label: 'Focus Terminal', icon: 'external-link', variant: 'primary' as const },
            ],
          },
        });
      }
    }
  }

  override getActions(): ConnectorAction[] {
    return [
      { id: 'focus', label: 'Focus Terminal', icon: 'external-link', description: 'Bring terminal to foreground' },
      { id: 'dismiss', label: 'Dismiss', icon: 'x', description: 'Dismiss the notification' },
    ];
  }

  override async executeAction(actionId: string, params?: unknown): Promise<void> {
    if (actionId === 'focus') {
      const terminalApp = (this.config.settings.terminalApp as string) || 'Terminal';
      const sessionName = (params as { sessionName?: string })?.sessionName;

      if (terminalApp === 'iTerm2' || terminalApp === 'iTerm') {
        this.focusITerm2(sessionName);
      } else {
        execFile('osascript', ['-e', `tell application "${terminalApp}" to activate`], (err) => {
          if (err) warn('ClaudeCode', `Failed to focus ${terminalApp}:`, err.message);
        });
      }
    }
  }

  private focusITerm2(sessionName?: string): void {
    if (!sessionName) {
      execFile('osascript', ['-e', 'tell application "iTerm2" to activate'], (err) => {
        if (err) warn('ClaudeCode', 'Failed to focus iTerm2:', err.message);
      });
      return;
    }

    log('ClaudeCode', `iTerm2 tab search: looking for "${sessionName}"`);

    // Write AppleScript to temp file to avoid all escaping issues
    const escapedName = sessionName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const scriptContent = `
tell application "iTerm2"
  activate
  set targetName to "${escapedName}"
  set allNames to {}
  set foundIt to false
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        set sName to name of s
        copy sName to end of allNames
        if foundIt is false and sName contains targetName then
          select t
          tell w to select
          set foundIt to true
        end if
      end repeat
    end repeat
  end repeat
  set text item delimiters of AppleScript to " | "
  set nameList to allNames as text
  set text item delimiters of AppleScript to ""
  if foundIt then
    return "found|" & nameList
  else
    return "not-found|" & nameList
  end if
end tell
`;

    const tmpFile = join(tmpdir(), `iterm-search-${Date.now()}.scpt`);
    try {
      writeFileSync(tmpFile, scriptContent);
    } catch (e) {
      warn('ClaudeCode', 'Failed to write temp AppleScript:', (e as Error).message);
      return;
    }

    execFile('osascript', [tmpFile], (err, stdout) => {
      // Clean up temp file
      try { unlinkSync(tmpFile); } catch { /* ignore */ }

      if (err) {
        warn('ClaudeCode', 'iTerm2 AppleScript failed:', err.message);
        return;
      }

      const result = stdout.trim();
      const pipeIdx = result.indexOf('|');
      const status = result.substring(0, pipeIdx);
      const names = result.substring(pipeIdx + 1);

      if (status === 'found') {
        log('ClaudeCode', `iTerm2 tab found! Sessions: [${names}]`);
      } else {
        warn('ClaudeCode', `iTerm2 tab NOT found for "${sessionName}". Sessions: [${names}]`);
      }
    });
  }

  getActiveSessions(): Map<string, { lastEvent: number; status: string }> {
    return new Map(this.activeSessions);
  }
}
