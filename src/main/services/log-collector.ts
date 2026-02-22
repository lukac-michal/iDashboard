// ============================================================
// LogCollector - In-memory ring buffer + rotating log files
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LogLine {
  ts: number;
  level: 'log' | 'warn' | 'error';
  tag: string;
  message: string;
}

const MAX_BUFFER = 5000;
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB

export class LogCollector {
  private buffer: LogLine[] = [];
  private logDir: string;
  private currentFile: string | null = null;
  private currentDate: string | null = null;
  private fd: number | null = null;

  constructor(logDir: string) {
    this.logDir = logDir;
    fs.mkdirSync(logDir, { recursive: true });
    this.rotateIfNeeded();
  }

  append(level: LogLine['level'], tag: string, message: string): void {
    const line: LogLine = { ts: Date.now(), level, tag, message };

    // Ring buffer
    this.buffer.push(line);
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer = this.buffer.slice(this.buffer.length - MAX_BUFFER);
    }

    // Write to file
    this.rotateIfNeeded();
    if (this.fd !== null) {
      const time = new Date(line.ts).toISOString();
      const fileEntry = `[${time}] [${level.toUpperCase()}] [${tag}] ${message}\n`;
      try {
        fs.writeSync(this.fd, fileEntry);
      } catch {
        // Silently ignore write errors to avoid infinite loops
      }
    }
  }

  getLines(search?: string): LogLine[] {
    if (!search) return this.buffer;
    const lower = search.toLowerCase();
    return this.buffer.filter(
      (l) =>
        l.tag.toLowerCase().includes(lower) ||
        l.message.toLowerCase().includes(lower) ||
        l.level.includes(lower),
    );
  }

  destroy(): void {
    if (this.fd !== null) {
      try { fs.closeSync(this.fd); } catch { /* ignore */ }
      this.fd = null;
    }
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private rotateIfNeeded(): void {
    const today = this.todayKey();
    let needsRotation = false;

    if (this.currentDate !== today) {
      needsRotation = true;
    } else if (this.currentFile) {
      try {
        const stats = fs.statSync(this.currentFile);
        if (stats.size >= MAX_FILE_SIZE) {
          needsRotation = true;
        }
      } catch {
        needsRotation = true;
      }
    }

    if (!needsRotation && this.fd !== null) return;

    // Close existing fd
    if (this.fd !== null) {
      try { fs.closeSync(this.fd); } catch { /* ignore */ }
      this.fd = null;
    }

    this.currentDate = today;

    // Find a unique filename (handle multiple rotations per day)
    let suffix = 0;
    let filePath: string;
    do {
      const name = suffix === 0
        ? `idashboard-${today}.log`
        : `idashboard-${today}.${suffix}.log`;
      filePath = path.join(this.logDir, name);
      if (!fs.existsSync(filePath)) break;
      try {
        const stats = fs.statSync(filePath);
        if (stats.size < MAX_FILE_SIZE) break;
      } catch {
        break;
      }
      suffix++;
    } while (suffix < 100);

    this.currentFile = filePath;
    try {
      this.fd = fs.openSync(filePath, 'a');
    } catch {
      this.fd = null;
    }
  }
}
