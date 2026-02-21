// ============================================================
// Sound Notification Service
// Plays audio alerts for attention/critical events
// ============================================================

import * as path from 'node:path';
import * as fs from 'node:fs';
import { BrowserWindow } from 'electron';

export class SoundNotificationService {
  private enabled = true;
  private volume = 0.7;
  private customSoundPath: string | null = null;
  private lastPlayedAt = 0;
  private minIntervalMs = 2000; // Throttle sounds to max 1 per 2 seconds

  configure(opts: { enabled: boolean; file: string | null; volume: number }): void {
    this.enabled = opts.enabled;
    this.volume = Math.max(0, Math.min(1, opts.volume));
    this.customSoundPath = opts.file;
  }

  /** Play notification sound via the renderer's Web Audio API */
  play(window: BrowserWindow | null): void {
    if (!this.enabled || !window || window.isDestroyed()) return;

    const now = Date.now();
    if (now - this.lastPlayedAt < this.minIntervalMs) return;
    this.lastPlayedAt = now;

    // Use custom sound file if configured and exists
    if (this.customSoundPath && fs.existsSync(this.customSoundPath)) {
      const dataUrl = this.getDataUrl(this.customSoundPath);
      window.webContents.executeJavaScript(
        `(function(){var a=new Audio("${dataUrl}");a.volume=${this.volume};a.play().catch(function(){});})()`
      );
      return;
    }

    // Fall back to a synthesized beep via Web Audio API
    window.webContents.executeJavaScript(
      `(function(){` +
      `var c=new AudioContext();` +
      `var o=c.createOscillator();` +
      `var g=c.createGain();` +
      `o.connect(g);g.connect(c.destination);` +
      `o.frequency.setValueAtTime(880,c.currentTime);` +
      `o.frequency.setValueAtTime(660,c.currentTime+0.1);` +
      `g.gain.setValueAtTime(${this.volume},c.currentTime);` +
      `g.gain.exponentialRampToValueAtTime(0.01,c.currentTime+0.3);` +
      `o.start(c.currentTime);o.stop(c.currentTime+0.3);` +
      `})()`
    );
  }

  /** Test sound (called from settings UI) */
  test(window: BrowserWindow | null): void {
    const wasEnabled = this.enabled;
    this.enabled = true;
    this.lastPlayedAt = 0;
    this.play(window);
    this.enabled = wasEnabled;
  }

  private getDataUrl(filePath: string): string {
    const ext = path.extname(filePath).slice(1);
    const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : 'audio/wav';
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${data}`;
  }
}
