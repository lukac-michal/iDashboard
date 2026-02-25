// ============================================================
// SlackChannelLogger - Per-channel log files for Slack activity
// Logs sent/received messages with truncated content
// Files: ~/.idashboard/logs/slack/<channel-name>.log
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const MAX_BODY = 500;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB per channel file

function truncate(text: string, limit = MAX_BODY): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + '...[truncated]';
}

function ts(): string {
  return new Date().toISOString();
}

export class SlackChannelLogger {
  private logDir: string;
  private fds = new Map<string, number>();

  constructor(baseDir?: string) {
    this.logDir = baseDir ?? path.join(os.homedir(), '.idashboard', 'logs', 'slack');
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  /** Log an outbound message (bot → Slack) */
  logSent(channel: string, text: string, threadTs?: string): void {
    const ch = this.normalizeChannel(channel);
    const line = `[${ts()}] >>> SENT${threadTs ? ` (thread:${threadTs})` : ''}\n${truncate(text)}\n---\n`;
    this.append(ch, line);
  }

  /** Log the API response after sending */
  logSendResult(channel: string, ok: boolean, resultTs?: string, error?: string): void {
    const ch = this.normalizeChannel(channel);
    const status = ok ? `OK ts=${resultTs ?? '?'}` : `FAIL error=${error ?? 'unknown'}`;
    const line = `[${ts()}] <<< SEND_RESULT: ${status}\n`;
    this.append(ch, line);
  }

  /** Log an inbound message (Slack → app, from polling) */
  logReceived(channel: string, user: string, text: string, msgTs: string, threadTs?: string): void {
    const ch = this.normalizeChannel(channel);
    const thread = threadTs ? ` (thread:${threadTs})` : '';
    const line = `[${ts()}] <<< RECV from=${user} ts=${msgTs}${thread}\n${truncate(text)}\n---\n`;
    this.append(ch, line);
  }

  /** Log a bridge forward event (hook output → Slack) */
  logBridgeForward(channel: string, sessionId: string, eventType: string, text: string): void {
    const ch = this.normalizeChannel(channel);
    const line = `[${ts()}] >>> BRIDGE session=${sessionId} type=${eventType}\n${truncate(text)}\n---\n`;
    this.append(ch, line);
  }

  /** Log a bridge reverse event (Slack reply → terminal) */
  logBridgeReverse(channel: string, sessionId: string, user: string, text: string): void {
    const ch = this.normalizeChannel(channel);
    const line = `[${ts()}] <<< BRIDGE_REVERSE session=${sessionId} from=${user}\n${truncate(text)}\n---\n`;
    this.append(ch, line);
  }

  /** Log arbitrary info for a channel */
  logInfo(channel: string, message: string): void {
    const ch = this.normalizeChannel(channel);
    const line = `[${ts()}] INFO: ${message}\n`;
    this.append(ch, line);
  }

  destroy(): void {
    for (const fd of this.fds.values()) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    this.fds.clear();
  }

  private normalizeChannel(channel: string): string {
    // Strip # prefix, replace special chars
    return channel.replace(/^#/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private append(channel: string, line: string): void {
    const fd = this.getFd(channel);
    if (fd === null) return;
    try {
      fs.writeSync(fd, line);
    } catch {
      // Close and retry once on write error
      this.closeFd(channel);
    }
  }

  private getFd(channel: string): number | null {
    const existing = this.fds.get(channel);
    if (existing !== undefined) {
      // Rotate if file is too large
      const filePath = this.filePath(channel);
      try {
        const stats = fs.statSync(filePath);
        if (stats.size >= MAX_FILE_SIZE) {
          this.rotate(channel, filePath);
        }
      } catch { /* file may not exist yet */ }
      return existing;
    }

    const filePath = this.filePath(channel);
    try {
      const fd = fs.openSync(filePath, 'a');
      this.fds.set(channel, fd);
      return fd;
    } catch {
      return null;
    }
  }

  private closeFd(channel: string): void {
    const fd = this.fds.get(channel);
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
      this.fds.delete(channel);
    }
  }

  private filePath(channel: string): string {
    return path.join(this.logDir, `${channel}.log`);
  }

  private rotate(channel: string, filePath: string): void {
    this.closeFd(channel);
    const rotated = `${filePath}.${Date.now()}.bak`;
    try {
      fs.renameSync(filePath, rotated);
    } catch { /* ignore */ }
    // Re-open fresh file
    try {
      const fd = fs.openSync(filePath, 'a');
      this.fds.set(channel, fd);
    } catch { /* ignore */ }
  }
}
