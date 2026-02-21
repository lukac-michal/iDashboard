// ============================================================
// Multi-Monitor Support
// Detects displays and manages window placement across monitors
// ============================================================

import { screen, BrowserWindow } from 'electron';

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}

export class MultiMonitorService {
  /** Get all connected displays */
  getDisplays(): DisplayInfo[] {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((display, i) => ({
      id: display.id,
      label: display.id === primary.id ? `Display ${i + 1} (Primary)` : `Display ${i + 1}`,
      bounds: display.bounds,
      workArea: display.workArea,
      isPrimary: display.id === primary.id,
      scaleFactor: display.scaleFactor,
    }));
  }

  /** Move window to a specific display */
  moveToDisplay(window: BrowserWindow, displayId: number): void {
    const target = screen.getAllDisplays().find(d => d.id === displayId);
    if (!target) return;

    const [width, height] = window.getSize();
    const x = target.workArea.x + Math.floor((target.workArea.width - width) / 2);
    const y = target.workArea.y + Math.floor((target.workArea.height - height) / 2);

    window.setPosition(x, y);
  }

  /** Snap window to an edge of its current display */
  snapToEdge(window: BrowserWindow, edge: 'left' | 'right' | 'top' | 'bottom'): void {
    const windowBounds = window.getBounds();
    const display = screen.getDisplayNearestPoint({ x: windowBounds.x, y: windowBounds.y });
    const wa = display.workArea;

    switch (edge) {
      case 'left':
        window.setBounds({ x: wa.x, y: wa.y, width: Math.floor(wa.width / 2), height: wa.height });
        break;
      case 'right':
        window.setBounds({
          x: wa.x + Math.floor(wa.width / 2),
          y: wa.y,
          width: Math.ceil(wa.width / 2),
          height: wa.height,
        });
        break;
      case 'top':
        window.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: Math.floor(wa.height / 2) });
        break;
      case 'bottom':
        window.setBounds({
          x: wa.x,
          y: wa.y + Math.floor(wa.height / 2),
          width: wa.width,
          height: Math.ceil(wa.height / 2),
        });
        break;
    }
  }

  /** Get display that contains the given window */
  getWindowDisplay(window: BrowserWindow): DisplayInfo | null {
    const bounds = window.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    const primary = screen.getPrimaryDisplay();
    const all = screen.getAllDisplays();
    const idx = all.findIndex(d => d.id === display.id);

    return {
      id: display.id,
      label: display.id === primary.id ? `Display ${idx + 1} (Primary)` : `Display ${idx + 1}`,
      bounds: display.bounds,
      workArea: display.workArea,
      isPrimary: display.id === primary.id,
      scaleFactor: display.scaleFactor,
    };
  }

  /** Listen for display changes */
  onDisplayChange(callback: () => void): () => void {
    const handler = () => callback();
    screen.on('display-added', handler);
    screen.on('display-removed', handler);
    screen.on('display-metrics-changed', handler);

    return () => {
      screen.removeListener('display-added', handler);
      screen.removeListener('display-removed', handler);
      screen.removeListener('display-metrics-changed', handler);
    };
  }
}
