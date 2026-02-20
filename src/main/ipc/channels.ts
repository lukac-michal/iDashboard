// ============================================================
// IPC Handlers - Bridge between main process and renderer
// ============================================================

import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type { ConnectorEngine } from '@main/connectors/engine';
import type { EventStore } from '@main/db/event-store';
import type { WindowManager } from '@main/window/manager';
import type { NetworkReachabilityService } from '@main/services/network-reachability';
import type { AppConfig, ConnectorEvent, WindowMode, DockPosition } from '@shared/types';

interface IPCContext {
  engine: ConnectorEngine;
  eventStore: EventStore;
  windowManager: WindowManager;
  networkService: NetworkReachabilityService;
  getConfig: () => AppConfig;
}

export function registerIPCHandlers(ctx: IPCContext): void {
  // --- Events ---

  ipcMain.handle(IPC.EVENTS_LIST, () => {
    return ctx.eventStore.getActive();
  });

  ipcMain.handle(IPC.EVENTS_HISTORY, (_event, { limit, since }: { limit?: number; since?: number }) => {
    return ctx.eventStore.getRecent(limit, since);
  });

  ipcMain.handle(IPC.EVENTS_DISMISS, (_event, eventId: string) => {
    return ctx.eventStore.dismiss(eventId);
  });

  // --- Connectors ---

  ipcMain.handle(IPC.CONNECTORS_LIST, () => {
    return ctx.engine.getStatuses();
  });

  // --- Actions ---

  ipcMain.handle(IPC.ACTION_EXECUTE, async (_event, { connectorId, actionId, params }: {
    connectorId: string;
    actionId: string;
    params?: unknown;
  }) => {
    await ctx.engine.executeAction(connectorId, actionId, params);
  });

  // --- Window ---

  ipcMain.handle(IPC.WINDOW_MODE, (_event, mode: WindowMode) => {
    ctx.windowManager.setMode(mode);
  });

  ipcMain.handle(IPC.WINDOW_DOCK, (_event, position: DockPosition) => {
    ctx.windowManager.applyDockPosition(position);
  });

  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => {
    ctx.windowManager.getWindow()?.minimize();
  });

  ipcMain.handle(IPC.WINDOW_CLOSE, () => {
    ctx.windowManager.getWindow()?.hide();
  });

  // --- Config ---

  ipcMain.handle(IPC.CONFIG_GET, () => {
    return ctx.getConfig();
  });

  // --- Network ---

  ipcMain.handle(IPC.NETWORK_STATUS, () => {
    const healthMap = ctx.engine.getHealthMap();
    return {
      isOnline: ctx.networkService.isOnline,
      vpnDetected: ctx.networkService.vpnDetected,
      overallState: ctx.networkService.getOverallState(healthMap),
    };
  });
}

/** Push events to renderer process */
export function pushToRenderer(window: BrowserWindow | null, channel: string, data: unknown): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}
