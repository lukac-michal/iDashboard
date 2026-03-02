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

    // Merge bridge metadata (itermSessionId, etc.) into every event
    const baseMeta = { ...req.metadata, sessionId, eventType };

    const focusButton = { id: 'focus', label: 'Focus Terminal', icon: 'external-link', variant: 'primary' as const };

    switch (eventType) {
      case 'needs-input':
        return this.createEvent({
          severity: 'attention',
          title: req.title ?? `Claude Code: ${sessionId}`,
          body: message || 'Waiting for your input',
          category: 'notification',
          eventType: 'needs-input',
          metadata: baseMeta,
          uiHints: {
            icon: 'terminal',
            color: '#f97316',
            blinkDurationMs: blinkDuration,
            actionButtons: [focusButton],
          },
        });

      case 'task-complete':
        return this.createEvent({
          severity: 'info',
          title: req.title ?? `Claude Code: ${sessionId}`,
          body: 'Task completed',
          category: 'notification',
          eventType: 'task-complete',
          metadata: baseMeta,
          uiHints: {
            icon: 'check-circle',
            color: '#22c55e',
            blinkDurationMs: blinkDuration,
            actionButtons: [focusButton],
          },
        });

      case 'output-stop':
      case 'output-subagent-stop':
        return this.createEvent({
          severity: 'info',
          title: req.title ?? `Claude Code: ${sessionId}`,
          body: message,
          category: 'bridge-output',
          eventType,
          dismissed: true,
          metadata: { ...baseMeta, hookType: (req.metadata?.hookType as string) ?? eventType },
          uiHints: {
            icon: 'terminal',
            color: '#3b82f6',
            blinkDurationMs: blinkDuration,
            actionButtons: [focusButton],
          },
        });

      case 'output-tool-use':
        return this.createEvent({
          severity: 'info',
          title: req.title ?? `Claude Code: ${sessionId}`,
          body: message,
          category: 'bridge-output',
          eventType: 'output-tool-use',
          dismissed: true,
          metadata: { ...baseMeta, hookType: 'tool-use', toolName: (req.metadata?.toolName as string) ?? 'unknown' },
          uiHints: {
            icon: 'wrench',
            color: '#8b5cf6',
            blinkDurationMs: blinkDuration,
            actionButtons: [focusButton],
          },
        });

      case 'user-prompt':
        return this.createEvent({
          severity: 'info',
          title: `Claude Code: ${sessionId}`,
          body: message,
          category: 'bridge-output',
          eventType: 'user-prompt',
          dismissed: true,
          metadata: baseMeta,
          uiHints: {
            icon: 'user',
            color: '#06b6d4',
            blinkDurationMs: blinkDuration,
            actionButtons: [focusButton],
          },
        });

      case 'agent-message': {
        const from = (req.metadata?.from as string) ?? 'unknown';
        const to = (req.metadata?.to as string) ?? 'unknown';
        return this.createEvent({
          severity: 'info',
          title: `${from} → ${to}`,
          body: message,
          category: 'agent-message',
          eventType: 'agent-message',
          metadata: { ...baseMeta, from, to },
          uiHints: {
            icon: 'message-square',
            color: '#a855f7',
            blinkDurationMs: blinkDuration,
            actionButtons: [
              { id: 'view-message', label: 'View Full Message', icon: 'eye', variant: 'default' as const },
              { id: 'focus', label: 'Focus Agent', icon: 'external-link', variant: 'primary' as const },
            ],
          },
        });
      }

      default: {
        const severity = req.severity ?? 'info';
        return this.createEvent({
          severity,
          title: req.title ?? `Claude Code: ${sessionId}`,
          body: message,
          category: 'notification',
          eventType,
          metadata: baseMeta,
          uiHints: req.uiHints ?? {
            icon: 'terminal',
            color: '#f97316',
            blinkDurationMs: blinkDuration,
            actionButtons: [focusButton],
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
      if (process.platform !== 'darwin') {
        log('ClaudeCode', 'Terminal focus is not available on this platform');
        return;
      }
      const p = params as { sessionName?: string; itermSessionId?: string } | undefined;
      const sessionName = p?.sessionName;
      const itermSessionId = p?.itermSessionId;

      // Build terminal apps list from config with backward compatibility
      const terminalApps: string[] =
        (Array.isArray(this.config.settings.terminalApps)
          ? this.config.settings.terminalApps as string[]
          : null)
        ?? (typeof this.config.settings.terminalApp === 'string'
          ? [this.config.settings.terminalApp, ...(this.config.settings.terminalApp === 'Terminal' ? ['iTerm2'] : ['Terminal'])]
          : ['iTerm2', 'Terminal']);

      for (const app of terminalApps) {
        const found = await this.tryFocusTerminal(app, sessionName, itermSessionId);
        if (found) return;
      }

      // Fallback: just activate the first app in the list
      const fallbackApp = terminalApps[0] ?? 'iTerm2';
      log('ClaudeCode', `Session not found in any terminal, activating ${fallbackApp}`);
      execFile('osascript', ['-e', `tell application "${fallbackApp}" to activate`], (err) => {
        if (err) warn('ClaudeCode', `Failed to focus ${fallbackApp}:`, err.message);
      });
    }
  }

  private async tryFocusTerminal(app: string, sessionName?: string, itermSessionId?: string): Promise<boolean> {
    // Check if app is running first
    const isRunning = await this.isAppRunning(app);
    if (!isRunning) return false;

    if (!sessionName && !itermSessionId) {
      execFile('osascript', ['-e', `tell application "${app}" to activate`]);
      return true;
    }

    if (app === 'iTerm2' || app === 'iTerm') {
      return this.focusITerm2(sessionName, itermSessionId);
    }
    if (app === 'Terminal') {
      return this.focusTerminalApp(sessionName ?? '');
    }

    // Unknown app: just activate it (no session search)
    log('ClaudeCode', `Activating ${app} (no session search for this app)`);
    execFile('osascript', ['-e', `tell application "${app}" to activate`]);
    return true;
  }

  private isAppRunning(appName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const script = `tell application "System Events" to (name of every process) contains "${appName}"`;
      execFile('osascript', ['-e', script], (err, stdout) => {
        resolve(!err && stdout.trim() === 'true');
      });
    });
  }

  private focusITerm2(sessionName?: string, itermSessionId?: string): Promise<boolean> {
    return new Promise((resolve) => {
      log('ClaudeCode', `iTerm2 tab search: name="${sessionName ?? ''}" itermId="${itermSessionId ?? ''}"`);

      // ITERM_SESSION_ID format is "w0t0p0:GUID" — we match on the GUID part
      // via iTerm2's "unique id" property on each session.
      const hasItermId = itermSessionId && itermSessionId.includes(':');
      const itermGuid = hasItermId ? itermSessionId!.split(':').slice(1).join(':') : '';
      const escapedGuid = itermGuid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      const escapedName = (sessionName ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      const scriptContent = `
tell application "iTerm2"
  set foundIt to false
${hasItermId ? `
  -- Pass 0: exact match by iTerm2 unique session ID (most precise)
  set targetId to "${escapedGuid}"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if foundIt is false then
          try
            set sId to unique id of s
            if sId contains targetId then
              select t
              tell w to select
              set foundIt to true
            end if
          end try
        end if
      end repeat
    end repeat
  end repeat
` : ''}
${escapedName !== '' ? `
  -- Pass 1: match session name (covers default titles)
  set targetName to "${escapedName}"
  if foundIt is false then
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if foundIt is false then
            set sName to name of s
            if sName contains targetName then
              select t
              tell w to select
              set foundIt to true
            end if
          end if
        end repeat
      end repeat
    end repeat
  end if
  -- Pass 2: match working-directory path (covers renamed tabs)
  if foundIt is false then
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if foundIt is false then
            try
              set sPath to path of s
              if sPath contains targetName then
                select t
                tell w to select
                set foundIt to true
              end if
            end try
          end if
        end repeat
      end repeat
    end repeat
  end if
` : ''}
  if foundIt then
    activate
    return "found"
  else
    return "not-found"
  end if
end tell
`;

      const tmpFile = join(tmpdir(), `iterm-search-${Date.now()}.scpt`);
      try {
        writeFileSync(tmpFile, scriptContent);
      } catch (e) {
        warn('ClaudeCode', 'Failed to write temp AppleScript:', (e as Error).message);
        resolve(false);
        return;
      }

      execFile('osascript', [tmpFile], (err, stdout) => {
        try { unlinkSync(tmpFile); } catch { /* ignore */ }

        if (err) {
          warn('ClaudeCode', 'iTerm2 AppleScript failed:', err.message);
          resolve(false);
          return;
        }

        const found = stdout.trim() === 'found';
        log('ClaudeCode', `iTerm2 search result: ${found ? 'found' : 'not found'}`);
        resolve(found);
      });
    });
  }

  private focusTerminalApp(sessionName: string): Promise<boolean> {
    return new Promise((resolve) => {
      log('ClaudeCode', `Terminal.app tab search: looking for "${sessionName}"`);

      const escapedName = sessionName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const scriptContent = `
tell application "Terminal"
  set targetName to "${escapedName}"
  set foundIt to false
  repeat with w in windows
    repeat with t in tabs of w
      set tTitle to custom title of t
      set tProcess to processes of t as text
      if foundIt is false and (tTitle contains targetName or tProcess contains targetName) then
        set selected tab of w to t
        set index of w to 1
        set foundIt to true
      end if
    end repeat
  end repeat
  if foundIt then
    activate
    return "found"
  else
    return "not-found"
  end if
end tell
`;

      const tmpFile = join(tmpdir(), `terminal-search-${Date.now()}.scpt`);
      try {
        writeFileSync(tmpFile, scriptContent);
      } catch (e) {
        warn('ClaudeCode', 'Failed to write temp AppleScript:', (e as Error).message);
        resolve(false);
        return;
      }

      execFile('osascript', [tmpFile], (err, stdout) => {
        try { unlinkSync(tmpFile); } catch { /* ignore */ }

        if (err) {
          warn('ClaudeCode', 'Terminal.app AppleScript failed:', err.message);
          resolve(false);
          return;
        }

        const found = stdout.trim() === 'found';
        log('ClaudeCode', `Terminal.app search result: ${found ? 'found' : 'not found'}`);
        resolve(found);
      });
    });
  }

  getActiveSessions(): Map<string, { lastEvent: number; status: string }> {
    return new Map(this.activeSessions);
  }
}
