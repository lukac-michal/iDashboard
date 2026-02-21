// ============================================================
// Window Manager - Window modes, positioning, docking, always-on-top
// ============================================================

import { BrowserWindow, screen } from 'electron';
import { log } from '../utils/log';
import type { WindowConfig, DockPosition, WindowMode } from '@shared/types';

export class WindowManager {
  private window: BrowserWindow | null = null;
  private config: WindowConfig;
  private preloadPath?: string;
  private alwaysOnTopTimer?: ReturnType<typeof setTimeout>;
  private flashTimer?: ReturnType<typeof setInterval>;

  constructor(config: WindowConfig, preloadPath?: string) {
    this.config = config;
    this.preloadPath = preloadPath;
  }

  createWindow(): BrowserWindow {
    const { size, position, opacity, frameless } = this.config;

    this.window = new BrowserWindow({
      width: size.width,
      height: size.height,
      minWidth: size.minWidth,
      minHeight: size.minHeight,
      x: position.x ?? undefined,
      y: position.y ?? undefined,
      frame: !frameless,
      transparent: frameless,
      opacity,
      alwaysOnTop: this.config.alwaysOnTop.permanent,
      skipTaskbar: false,
      show: !this.config.dock.autoHide,
      resizable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: this.preloadPath,
        sandbox: true,
      },
    });

    // Apply dock position
    if (this.config.dock.position) {
      this.applyDockPosition(this.config.dock.position);
    }

    // Remember size/position
    this.window.on('resize', () => this.onResize());
    this.window.on('move', () => this.onMove());

    return this.window;
  }

  getWindow(): BrowserWindow | null {
    return this.window;
  }

  /** Apply dock position to a screen edge/corner */
  applyDockPosition(position: DockPosition): void {
    if (!this.window) return;

    const display = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = display.workAreaSize;
    const [winW, winH] = this.window.getSize();
    const offsetX = this.config.dock.offsetX;
    const offsetY = this.config.dock.offsetY;

    let x = 0, y = 0;

    switch (position) {
      case 'top':
        x = Math.round((screenW - winW) / 2) + offsetX;
        y = offsetY;
        break;
      case 'bottom':
        x = Math.round((screenW - winW) / 2) + offsetX;
        y = screenH - winH - offsetY;
        break;
      case 'left':
        x = offsetX;
        y = Math.round((screenH - winH) / 2) + offsetY;
        break;
      case 'right':
        x = screenW - winW - offsetX;
        y = Math.round((screenH - winH) / 2) + offsetY;
        break;
      case 'top-left':
        x = offsetX;
        y = offsetY;
        break;
      case 'top-right':
        x = screenW - winW - offsetX;
        y = offsetY;
        break;
      case 'bottom-left':
        x = offsetX;
        y = screenH - winH - offsetY;
        break;
      case 'bottom-right':
        x = screenW - winW - offsetX;
        y = screenH - winH - offsetY;
        break;
    }

    this.window.setBounds({ x, y, width: winW, height: winH });
  }

  /** Surface window as always-on-top temporarily for a notification */
  surfaceForNotification(): void {
    if (!this.window) {
      log('Window', 'surfaceForNotification: no window');
      return;
    }

    const notifConfig = this.config.alwaysOnTop.onNotification;
    if (!notifConfig.enabled) {
      log('Window', 'surfaceForNotification: disabled in config');
      return;
    }

    // Show and bring to front
    log('Window', `surfaceForNotification: showing window (visible=${this.window.isVisible()}, minimized=${this.window.isMinimized()})`);
    this.window.show();
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.focus();

    // Set timer to revert
    if (this.alwaysOnTopTimer) clearTimeout(this.alwaysOnTopTimer);
    this.alwaysOnTopTimer = setTimeout(() => {
      this.handleNotificationExpiry(notifConfig.afterExpiry);
    }, notifConfig.durationSec * 1000);
  }

  /** Cancel the temporary always-on-top (e.g., user interacted) */
  cancelTemporaryAlwaysOnTop(): void {
    if (this.alwaysOnTopTimer) {
      clearTimeout(this.alwaysOnTopTimer);
      this.alwaysOnTopTimer = undefined;
    }
    this.stopFlash();

    if (!this.config.alwaysOnTop.permanent) {
      this.window?.setAlwaysOnTop(false);
    }
  }

  setMode(mode: WindowMode): void {
    if (!this.window) return;

    switch (mode) {
      case 'floating':
        this.window.setAlwaysOnTop(this.config.alwaysOnTop.permanent);
        this.window.show();
        break;
      case 'fullscreen':
        this.window.setAlwaysOnTop(false);
        this.window.maximize();
        this.window.show();
        break;
      case 'tray':
        this.window.hide();
        break;
      case 'docked':
        if (this.config.dock.position) {
          this.applyDockPosition(this.config.dock.position);
        }
        this.window.show();
        break;
    }
  }

  updateConfig(config: WindowConfig): void {
    this.config = config;
    if (this.window) {
      this.window.setOpacity(config.opacity);
      if (config.alwaysOnTop.permanent) {
        this.window.setAlwaysOnTop(true, 'floating');
      }
    }
  }

  private handleNotificationExpiry(action: 'hide' | 'lower' | 'minimize' | 'stay'): void {
    if (!this.window) return;
    this.stopFlash();

    switch (action) {
      case 'hide':
        this.window.hide();
        break;
      case 'lower':
        this.window.setAlwaysOnTop(false);
        break;
      case 'minimize':
        this.window.minimize();
        break;
      case 'stay':
        this.window.setAlwaysOnTop(false);
        break;
    }
  }

  private startFlash(count: number, intervalMs: number): void {
    this.stopFlash();
    if (!this.window || count === 0) return;

    let flashes = 0;
    this.flashTimer = setInterval(() => {
      if (!this.window || flashes >= count * 2) {
        this.stopFlash();
        return;
      }
      // Toggle opacity for flash effect
      this.window.setOpacity(flashes % 2 === 0 ? 0.5 : this.config.opacity);
      flashes++;
    }, intervalMs);
  }

  private stopFlash(): void {
    if (this.flashTimer) {
      clearInterval(this.flashTimer);
      this.flashTimer = undefined;
    }
    this.window?.setOpacity(this.config.opacity);
  }

  private onResize(): void {
    // Size persistence handled externally via IPC
  }

  private onMove(): void {
    // Position persistence handled externally via IPC
  }
}
