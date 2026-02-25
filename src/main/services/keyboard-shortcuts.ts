// ============================================================
// Keyboard Shortcuts Service
// Registers global and local keyboard shortcuts
// ============================================================

import { globalShortcut, BrowserWindow } from 'electron';
import type { KeyboardShortcut } from '@shared/types';

type ShortcutHandler = () => void;

export class KeyboardShortcutService {
  private handlers = new Map<string, ShortcutHandler>();
  private registered: string[] = [];

  /** Default shortcuts */
  getDefaults(): KeyboardShortcut[] {
    return [
      { id: 'toggle-visibility', keys: 'CommandOrControl+Shift+D', action: 'toggle-visibility', description: 'Show/hide dashboard', scope: 'global' },
      { id: 'toggle-fullscreen', keys: 'CommandOrControl+Shift+F', action: 'toggle-fullscreen', description: 'Toggle maximized mode', scope: 'global' },
      { id: 'escape-fullscreen', keys: 'Escape', action: 'escape-fullscreen', description: 'Exit fullscreen/maximized', scope: 'app' },
      { id: 'dismiss-all', keys: 'CommandOrControl+Shift+X', action: 'dismiss-all', description: 'Dismiss all events', scope: 'app' },
      { id: 'open-settings', keys: 'CommandOrControl+,', action: 'open-settings', description: 'Open settings', scope: 'app' },
      { id: 'focus-search', keys: 'CommandOrControl+K', action: 'focus-search', description: 'Focus search/filter', scope: 'app' },
      { id: 'refresh', keys: 'CommandOrControl+R', action: 'refresh', description: 'Refresh all connectors', scope: 'app' },
      { id: 'export-data', keys: 'CommandOrControl+Shift+E', action: 'export-data', description: 'Export event data', scope: 'app' },
    ];
  }

  /** Register a handler for an action */
  onAction(action: string, handler: ShortcutHandler): void {
    this.handlers.set(action, handler);
  }

  /** Register all global shortcuts */
  registerGlobal(shortcuts: KeyboardShortcut[]): void {
    this.unregisterAll();

    for (const shortcut of shortcuts) {
      if (shortcut.scope !== 'global') continue;

      try {
        const success = globalShortcut.register(shortcut.keys, () => {
          const handler = this.handlers.get(shortcut.action);
          if (handler) handler();
        });

        if (success) {
          this.registered.push(shortcut.keys);
        } else {
          console.warn(`[Shortcuts] Failed to register global: ${shortcut.keys}`);
        }
      } catch (err) {
        console.warn(`[Shortcuts] Error registering ${shortcut.keys}:`, err);
      }
    }
  }

  /** Register app-scoped shortcuts on a window via accelerators */
  registerAppShortcuts(window: BrowserWindow, shortcuts: KeyboardShortcut[]): void {
    const appShortcuts = shortcuts.filter(s => s.scope === 'app');

    // Send to renderer for local handling
    if (!window.isDestroyed()) {
      window.webContents.send('shortcuts:register', appShortcuts);
    }
  }

  unregisterAll(): void {
    for (const keys of this.registered) {
      try {
        globalShortcut.unregister(keys);
      } catch {
        // Already unregistered
      }
    }
    this.registered = [];
  }

  destroy(): void {
    this.unregisterAll();
    this.handlers.clear();
  }
}
