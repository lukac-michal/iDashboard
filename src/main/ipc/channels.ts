// ============================================================
// IPC Handlers - Bridge between main process and renderer
// ============================================================

import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type { ConnectorEngine } from '@main/connectors/engine';
import type { EventStore } from '@main/db/event-store';
import type { Aggregator } from '@main/db/aggregator';
import type { WindowManager } from '@main/window/manager';
import type { NetworkReachabilityService } from '@main/services/network-reachability';
import type { LayoutPersistenceService } from '@main/services/layout-persistence';
import type { ThemeManager } from '@main/services/theme-manager';
import type { SoundNotificationService } from '@main/services/sound-notification';
import type { DataExportService } from '@main/services/data-export';
import type { RulesEngine } from '@main/services/rules-engine';
import type {
  AppConfig,
  ConnectorConfig,
  WindowMode,
  DockPosition,
  AggregateQuery,
  ExportOptions,
  GridLayoutItem,
  CrossConnectorRule,
} from '@shared/types';

export interface IPCContext {
  engine: ConnectorEngine;
  eventStore: EventStore;
  aggregator: Aggregator;
  windowManager: WindowManager;
  networkService: NetworkReachabilityService;
  layoutService: LayoutPersistenceService;
  themeManager: ThemeManager;
  soundService: SoundNotificationService;
  exportService: DataExportService;
  rulesEngine: RulesEngine;
  getConfig: () => AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;
  addConnector: (config: ConnectorConfig) => Promise<void>;
  updateConnector: (config: ConnectorConfig) => Promise<void>;
  removeConnector: (id: string) => Promise<void>;
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

  ipcMain.handle(IPC.CONFIG_UPDATE_PARTIAL, (_event, partial: Partial<AppConfig>) => {
    ctx.updateConfig(partial);
    return ctx.getConfig();
  });

  // --- Connector Management ---

  ipcMain.handle(IPC.CONNECTORS_ADD, async (_event, config: ConnectorConfig) => {
    await ctx.addConnector(config);
    return ctx.engine.getStatuses();
  });

  ipcMain.handle(IPC.CONNECTORS_UPDATE, async (_event, config: ConnectorConfig) => {
    await ctx.updateConnector(config);
    return ctx.engine.getStatuses();
  });

  ipcMain.handle(IPC.CONNECTORS_REMOVE, async (_event, id: string) => {
    await ctx.removeConnector(id);
    return ctx.engine.getStatuses();
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

  ipcMain.handle(IPC.CONNECTOR_HEALTH_ALL, () => {
    const healthMap = ctx.engine.getHealthMap();
    const statuses = ctx.engine.getStatuses();
    return statuses.map(s => ({
      ...s,
      health: healthMap.get(s.id) ?? s.health,
    }));
  });

  // --- Layout ---

  ipcMain.handle(IPC.LAYOUT_SAVE, (_event, { name, layout }: { name: string; layout: { items: GridLayoutItem[]; columns: number } }) => {
    ctx.layoutService.save(name, layout.items, layout.columns);
    return { ok: true };
  });

  ipcMain.handle(IPC.LAYOUT_LOAD, (_event, name: string) => {
    return ctx.layoutService.load(name);
  });

  ipcMain.handle(IPC.LAYOUT_LIST, () => {
    return ctx.layoutService.list();
  });

  // --- Theme ---

  ipcMain.handle(IPC.THEME_SET, (_event, themeName: string) => {
    const colors = ctx.themeManager.setTheme(themeName);
    return colors ? { ok: true, colors, cssVars: ctx.themeManager.toCssVars(colors) } : { ok: false };
  });

  ipcMain.handle(IPC.THEME_GET_CUSTOM, () => {
    return {
      current: ctx.themeManager.getCurrentTheme(),
      available: ctx.themeManager.getAvailableThemes(),
      customs: ctx.themeManager.getCustomThemes(),
    };
  });

  // --- Aggregates ---

  ipcMain.handle(IPC.AGGREGATES_QUERY, (_event, query: AggregateQuery) => {
    if (query.connectorId) {
      return ctx.aggregator.getAggregates(query.connectorId, query.fromDayKey, query.toDayKey);
    }
    const statuses = ctx.engine.getStatuses();
    const allAggs = [];
    for (const s of statuses) {
      allAggs.push(...ctx.aggregator.getAggregates(s.id, query.fromDayKey, query.toDayKey));
    }
    return allAggs;
  });

  // --- Export ---

  ipcMain.handle(IPC.EXPORT_EVENTS, async (_event, options: ExportOptions) => {
    const window = ctx.windowManager.getWindow();
    if (window) {
      const filePath = await ctx.exportService.exportWithDialog(window, options);
      return { ok: !!filePath, filePath };
    }
    return { ok: false, error: 'No window available' };
  });

  // --- Sound ---

  ipcMain.handle(IPC.SOUND_TEST, () => {
    const window = ctx.windowManager.getWindow();
    ctx.soundService.test(window);
    return { ok: true };
  });

  // --- Rules ---

  ipcMain.handle(IPC.RULES_LIST, () => {
    return ctx.rulesEngine.getRules();
  });

  ipcMain.handle(IPC.RULES_SAVE, (_event, rules: CrossConnectorRule[]) => {
    ctx.rulesEngine.setRules(rules);
    return { ok: true };
  });
}

/** Push events to renderer process */
export function pushToRenderer(window: BrowserWindow | null, channel: string, data: unknown): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}
