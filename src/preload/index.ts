// ============================================================
// Preload Script - Exposes safe IPC bridge to renderer
// ============================================================

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc-channels';

const api = {
  // Events
  getEvents: () => ipcRenderer.invoke(IPC.EVENTS_LIST),
  getEventHistory: (opts: { limit?: number; since?: number }) =>
    ipcRenderer.invoke(IPC.EVENTS_HISTORY, opts),
  dismissEvent: (eventId: string) =>
    ipcRenderer.invoke(IPC.EVENTS_DISMISS, eventId),

  // Connectors
  getConnectors: () => ipcRenderer.invoke(IPC.CONNECTORS_LIST),

  // Actions
  executeAction: (connectorId: string, actionId: string, params?: unknown) =>
    ipcRenderer.invoke(IPC.ACTION_EXECUTE, { connectorId, actionId, params }),

  // Window
  setWindowMode: (mode: string) => ipcRenderer.invoke(IPC.WINDOW_MODE, mode),
  dockWindow: (position: string) => ipcRenderer.invoke(IPC.WINDOW_DOCK, position),
  minimizeWindow: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),

  // Config
  getConfig: () => ipcRenderer.invoke(IPC.CONFIG_GET),

  // Network
  getNetworkStatus: () => ipcRenderer.invoke(IPC.NETWORK_STATUS),

  // Subscriptions (main → renderer push)
  onEvent: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(IPC.EVENTS_STREAM, handler);
    return () => ipcRenderer.removeListener(IPC.EVENTS_STREAM, handler);
  },

  onConfigChanged: (callback: (config: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(IPC.CONFIG_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.CONFIG_CHANGED, handler);
  },

  onNetworkChanged: (callback: (status: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(IPC.NETWORK_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.NETWORK_CHANGED, handler);
  },
};

contextBridge.exposeInMainWorld('iDashboard', api);

export type IDashboardAPI = typeof api;
