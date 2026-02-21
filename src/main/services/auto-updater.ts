// ============================================================
// Auto-Updater Service
// Checks for updates and manages the update lifecycle
// Uses electron-builder's autoUpdater when available
// ============================================================

import { app, dialog, BrowserWindow } from 'electron';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  lastCheckedAt: number;
  downloadProgress?: number;
  error?: string;
}

export class AutoUpdaterService {
  private info: UpdateInfo = {
    currentVersion: app.getVersion(),
    updateAvailable: false,
    lastCheckedAt: 0,
  };

  private checkIntervalMs = 4 * 60 * 60_000; // 4 hours
  private timer?: ReturnType<typeof setInterval>;
  private autoUpdater: unknown = null;

  constructor() {
    // Try to load electron-updater (packaged apps only)
    try {
      this.autoUpdater = require('electron-updater');
    } catch {
      // Not available in dev mode
    }
  }

  /** Get current update status */
  getInfo(): UpdateInfo {
    return { ...this.info };
  }

  /** Start periodic update checks */
  start(enabled: boolean): void {
    if (!enabled || !this.autoUpdater) return;

    this.checkForUpdates();
    this.timer = setInterval(() => this.checkForUpdates(), this.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Manual update check with user notification */
  async checkForUpdates(notify?: BrowserWindow): Promise<UpdateInfo> {
    this.info.lastCheckedAt = Date.now();

    if (!this.autoUpdater) {
      this.info.error = 'Auto-updater not available in development mode';
      if (notify) {
        dialog.showMessageBox(notify, {
          type: 'info',
          title: 'Update Check',
          message: `iDashboard v${this.info.currentVersion}`,
          detail: 'Auto-updater is not available in development mode. Updates are checked automatically in packaged builds.',
        });
      }
      return this.info;
    }

    try {
      const updater = this.autoUpdater as {
        checkForUpdatesAndNotify: () => Promise<{ updateInfo: { version: string } } | null>;
      };

      const result = await updater.checkForUpdatesAndNotify();
      if (result?.updateInfo) {
        this.info.latestVersion = result.updateInfo.version;
        this.info.updateAvailable = result.updateInfo.version !== this.info.currentVersion;
      } else {
        this.info.updateAvailable = false;
      }
      this.info.error = undefined;
    } catch (err) {
      this.info.error = err instanceof Error ? err.message : String(err);
    }

    return this.info;
  }
}
