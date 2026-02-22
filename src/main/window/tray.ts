// ============================================================
// System Tray - Tray icon with context menu
// ============================================================

import { Tray, Menu, nativeImage } from 'electron';
import * as path from 'node:path';
import type { WindowManager } from './manager';

export class TrayManager {
  private tray: Tray | null = null;
  private windowManager: WindowManager;
  private badgeCount = 0;

  constructor(windowManager: WindowManager) {
    this.windowManager = windowManager;
  }

  create(): void {
    // Load tray icon from resources
    const iconPath = path.join(__dirname, '../../resources/tray-icon.png');
    let icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty();
    } else if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }
    this.tray = new Tray(icon);
    this.tray.setToolTip('iDashboard');
    this.updateContextMenu();

    this.tray.on('click', () => {
      const win = this.windowManager.getWindow();
      if (win) {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
      }
    });
  }

  setBadge(count: number): void {
    this.badgeCount = count;
    if (this.tray) {
      this.tray.setToolTip(count > 0 ? `iDashboard (${count} events)` : 'iDashboard');
    }
  }

  setStatus(status: 'healthy' | 'degraded' | 'offline'): void {
    // In production, swap tray icon based on status
    const tooltip = status === 'healthy' ? 'iDashboard'
      : status === 'degraded' ? 'iDashboard — Some services unreachable'
      : 'iDashboard — Offline';

    this.tray?.setToolTip(tooltip);
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private updateContextMenu(): void {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show Dashboard',
        click: () => {
          const win = this.windowManager.getWindow();
          win?.show();
          win?.focus();
        },
      },
      { type: 'separator' },
      {
        label: 'Floating Mode',
        click: () => this.windowManager.setMode('floating'),
      },
      {
        label: 'Fullscreen Mode',
        click: () => this.windowManager.setMode('fullscreen'),
      },
      { type: 'separator' },
      {
        label: 'Quit iDashboard',
        role: 'quit',
      },
    ]);

    this.tray?.setContextMenu(menu);
  }
}
