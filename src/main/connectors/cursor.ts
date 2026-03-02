// ============================================================
// Cursor IDE Connector
// Pull-based: polls Cursor workspace state.vscdb for composer activity
// Also supports push events from the bridge (when Claude Code runs in Cursor)
// ============================================================

import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { BaseConnector } from './base';
import { DEFAULT_BLINK_DURATION } from '@shared/constants';
import { log, warn } from '@main/utils/log';
import type {
  ConnectorCapability,
  ConnectorEvent,
  ConnectorAction,
  PushEventRequest,
} from '@shared/types';

/** Root of Cursor's workspace storage */
const WORKSPACE_STORAGE = join(
  homedir(),
  'Library',
  'Application Support',
  'Cursor',
  'User',
  'workspaceStorage',
);

interface ComposerSnapshot {
  composerId: string;
  name?: string;
  unifiedMode: string;       // 'agent' | 'chat' | 'edit'
  totalLinesAdded: number;
  totalLinesRemoved: number;
  filesChangedCount: number;
  lastUpdatedAt?: number;
  createdAt: number;
  subtitle?: string;
  hasBlockingPendingActions?: boolean;
  isArchived?: boolean;
  project: string;            // derived from workspace.json
}

export class CursorConnector extends BaseConnector {
  readonly type = 'cursor';
  readonly capabilities: ConnectorCapability[] = ['pull', 'push', 'action'];

  /** composerId → snapshot from last poll (used to detect changes) */
  private knownComposers = new Map<string, ComposerSnapshot>();
  private initialized = false;

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);

    if (existsSync(WORKSPACE_STORAGE)) {
      this.status.connected = true;
      // Seed with current state so we only emit NEW/CHANGED composers
      this.seedKnownComposers();
      log('Cursor', `Workspace storage found, seeded ${this.knownComposers.size} composers`);
    } else {
      this.status.connected = false;
      warn('Cursor', `Workspace storage not found at ${WORKSPACE_STORAGE}`);
    }
    this.initialized = true;
  }

  /** Poll all Cursor workspace DBs for new/changed composer sessions */
  override async poll(): Promise<ConnectorEvent[]> {
    if (!existsSync(WORKSPACE_STORAGE)) {
      this.status.connected = false;
      return [];
    }
    this.status.connected = true;

    const current = this.scanAllWorkspaces();
    if (!this.initialized) return [];

    const events: ConnectorEvent[] = [];
    const blinkDuration =
      (this.config.settings.blinkDurationMs as number | undefined) ?? DEFAULT_BLINK_DURATION;

    for (const [id, snap] of current) {
      const prev = this.knownComposers.get(id);

      // New composer we haven't seen before
      if (!prev) {
        // Skip drafts / empty composers with no activity
        if (snap.totalLinesAdded === 0 && snap.filesChangedCount === 0 && !snap.name) continue;
        events.push(this.composerEvent(snap, 'new', blinkDuration));
        continue;
      }

      // Existing composer with new file changes
      if (
        snap.filesChangedCount > prev.filesChangedCount ||
        snap.totalLinesAdded > prev.totalLinesAdded
      ) {
        events.push(this.composerEvent(snap, 'updated', blinkDuration));
      }
    }

    // Replace known state
    this.knownComposers = current;

    if (events.length > 0) {
      log('Cursor', `Polled ${events.length} new/updated composer(s)`);
    }
    return events;
  }

  /** Also accept push events from the bridge (Claude Code running inside Cursor) */
  normalizeInbound(rawEvent: unknown): ConnectorEvent {
    const req = rawEvent as PushEventRequest;
    const eventType = req.event ?? 'notification';
    const sessionId = req.session ?? 'unknown';
    const message = req.message ?? req.body ?? '';

    const blinkDuration =
      req.uiHints?.blinkDurationMs ??
      (this.config.settings.blinkDurationMs as number | undefined) ??
      DEFAULT_BLINK_DURATION;

    const baseMeta = { ...req.metadata, sessionId, eventType };
    const focusButton = { id: 'focus', label: 'Focus Editor', icon: 'external-link', variant: 'primary' as const };

    const severity = eventType === 'needs-input' ? 'attention' as const : req.severity ?? 'info' as const;

    return this.createEvent({
      severity,
      title: req.title ?? `Cursor: ${sessionId}`,
      body: message || (eventType === 'needs-input' ? 'Waiting for your input' : ''),
      category: 'notification',
      eventType,
      metadata: baseMeta,
      uiHints: req.uiHints ?? {
        icon: 'code',
        color: eventType === 'needs-input' ? '#f97316' : '#007acc',
        blinkDurationMs: blinkDuration,
        actionButtons: [focusButton],
      },
    });
  }

  override getActions(): ConnectorAction[] {
    return [
      { id: 'focus', label: 'Focus Editor', icon: 'external-link', description: 'Bring Cursor editor to foreground' },
      { id: 'dismiss', label: 'Dismiss', icon: 'x', description: 'Dismiss the notification' },
    ];
  }

  override async executeAction(actionId: string, _params?: unknown): Promise<void> {
    if (actionId === 'focus') {
      if (process.platform !== 'darwin') {
        log('Cursor', 'Editor focus is not available on this platform');
        return;
      }
      const editorApp = (this.config.settings.editorApp as string) ?? 'Cursor';
      log('Cursor', `Activating ${editorApp}`);
      execFile('osascript', ['-e', `tell application "${editorApp}" to activate`], (err) => {
        if (err) warn('Cursor', `Failed to focus ${editorApp}:`, err.message);
      });
    }
  }

  // --- Private helpers ---

  /** Seed known composers on startup so first poll only emits deltas */
  private seedKnownComposers(): void {
    this.knownComposers = this.scanAllWorkspaces();
  }

  /** Scan all workspace state.vscdb files and return a map of all composers */
  private scanAllWorkspaces(): Map<string, ComposerSnapshot> {
    const result = new Map<string, ComposerSnapshot>();

    let dirs: string[];
    try {
      dirs = readdirSync(WORKSPACE_STORAGE);
    } catch {
      return result;
    }

    for (const dir of dirs) {
      const wsDir = join(WORKSPACE_STORAGE, dir);
      const dbPath = join(wsDir, 'state.vscdb');
      if (!existsSync(dbPath)) continue;

      // Only scan DBs modified in the last 7 days to limit work
      try {
        const st = statSync(dbPath);
        if (Date.now() - st.mtimeMs > 7 * 24 * 60 * 60 * 1000) continue;
      } catch {
        continue;
      }

      const project = this.getWorkspaceProject(wsDir);
      const composers = this.queryComposers(dbPath, project);
      for (const c of composers) {
        result.set(c.composerId, c);
      }
    }

    return result;
  }

  /** Read workspace.json to get the project folder name */
  private getWorkspaceProject(wsDir: string): string {
    try {
      const wsJson = join(wsDir, 'workspace.json');
      if (!existsSync(wsJson)) return 'unknown';
      const data = JSON.parse(readFileSync(wsJson, 'utf-8'));
      const folder = data.folder as string | undefined;
      if (!folder) return 'unknown';
      // folder is like "file:///Users/foo/dev/MyProject"
      const decoded = decodeURIComponent(folder.replace(/^file:\/\//, ''));
      return basename(decoded);
    } catch {
      return 'unknown';
    }
  }

  /** Query composer.composerData from a single workspace state.vscdb */
  private queryComposers(dbPath: string, project: string): ComposerSnapshot[] {
    try {
      // Use URI with immutable=1 to avoid blocking on Cursor's active write lock.
      // This reads the last committed state without waiting for any WAL checkpoint.
      const uri = `file:${dbPath}?immutable=1`;
      const out = execFileSync('sqlite3', [
        uri,
        "SELECT value FROM ItemTable WHERE key = 'composer.composerData'",
      ], { encoding: 'utf-8', timeout: 8000 });

      const trimmed = out.trim();
      if (!trimmed) return [];

      const data = JSON.parse(trimmed);
      const allComposers = data.allComposers;
      if (!Array.isArray(allComposers)) return [];

      return allComposers
        .filter((c: Record<string, unknown>) => !c.isArchived && !c.isDraft)
        .map((c: Record<string, unknown>) => ({
          composerId: c.composerId as string,
          name: c.name as string | undefined,
          unifiedMode: (c.unifiedMode as string) || 'chat',
          totalLinesAdded: (c.totalLinesAdded as number) || 0,
          totalLinesRemoved: (c.totalLinesRemoved as number) || 0,
          filesChangedCount: (c.filesChangedCount as number) || 0,
          lastUpdatedAt: c.lastUpdatedAt as number | undefined,
          createdAt: (c.createdAt as number) || 0,
          subtitle: c.subtitle as string | undefined,
          hasBlockingPendingActions: c.hasBlockingPendingActions as boolean | undefined,
          isArchived: c.isArchived as boolean | undefined,
          project,
        }));
    } catch (e) {
      warn('Cursor', `Failed to read composers from ${basename(dbPath)}:`, (e as Error).message);
      return [];
    }
  }

  /** Create a ConnectorEvent from a composer snapshot */
  private composerEvent(
    snap: ComposerSnapshot,
    change: 'new' | 'updated',
    blinkDuration: number,
  ): ConnectorEvent {
    const mode = snap.unifiedMode === 'agent' ? 'Agent' : snap.unifiedMode === 'edit' ? 'Edit' : 'Chat';
    const title = snap.name
      ? `Cursor ${mode}: ${snap.name}`
      : `Cursor ${mode}: ${snap.project}`;

    const parts: string[] = [];
    if (snap.filesChangedCount > 0) {
      parts.push(`${snap.filesChangedCount} file${snap.filesChangedCount === 1 ? '' : 's'} changed`);
    }
    if (snap.totalLinesAdded > 0) {
      parts.push(`+${snap.totalLinesAdded} lines`);
    }
    if (snap.totalLinesRemoved > 0) {
      parts.push(`-${snap.totalLinesRemoved} lines`);
    }
    if (snap.subtitle) {
      parts.push(snap.subtitle);
    }
    const body = parts.join(' · ') || (change === 'new' ? 'New conversation' : 'Activity updated');

    return this.createEvent({
      severity: 'info',
      title,
      body,
      category: 'notification',
      eventType: 'task-complete',
      metadata: {
        composerId: snap.composerId,
        mode: snap.unifiedMode,
        project: snap.project,
        filesChanged: String(snap.filesChangedCount),
        linesAdded: String(snap.totalLinesAdded),
        change,
      },
      uiHints: {
        icon: 'code',
        color: '#007acc',
        blinkDurationMs: blinkDuration,
        actionButtons: [
          { id: 'focus', label: 'Focus Editor', icon: 'external-link', variant: 'primary' as const },
        ],
      },
    });
  }
}
