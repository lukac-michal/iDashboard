// ============================================================
// IPC Handlers - Bridge between main process and renderer
// ============================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { IPC } from '@shared/ipc-channels';
import { log, warn } from '@main/utils/log';
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
import type { LogCollector } from '@main/services/log-collector';
import type { AgentRegistry } from '@main/services/agent-registry';
import type { AgentLifecycleService } from '@main/services/agent-lifecycle';
import type { MasterAgentService } from '@main/services/master-agent';
import { SlackConnector } from '@main/connectors/slack';
import type {
  AppConfig,
  ConnectorConfig,
  WindowMode,
  DockPosition,
  AggregateQuery,
  ExportOptions,
  GridLayoutItem,
  CrossConnectorRule,
  AgentInfo,
  AgentStatus,
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
  logCollector: LogCollector;
  getConfig: () => AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;
  addConnector: (config: ConnectorConfig) => Promise<void>;
  updateConnector: (config: ConnectorConfig) => Promise<void>;
  removeConnector: (id: string) => Promise<void>;
  agentRegistry?: AgentRegistry;
  agentLifecycle?: AgentLifecycleService;
  masterAgent?: MasterAgentService;
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
    // When user clicks Focus Terminal/Editor, get the dashboard out of the way
    if (actionId === 'focus') {
      ctx.windowManager.cancelTemporaryAlwaysOnTop();
      // Small delay lets macOS process the target app's activate before we blur,
      // otherwise blur can cause the wrong app to grab focus
      setTimeout(() => ctx.windowManager.getWindow()?.blur(), 150);
    }
  });

  // --- Window ---

  ipcMain.handle(IPC.WINDOW_MODE, (_event, mode: WindowMode) => {
    ctx.windowManager.setMode(mode);
  });

  ipcMain.handle(IPC.WINDOW_DOCK, (_event, position: DockPosition) => {
    ctx.windowManager.applyDockPosition(position);
  });

  ipcMain.handle(IPC.WINDOW_RESIZE, (_event, { width, height }: { width: number; height: number }) => {
    const win = ctx.windowManager.getWindow();
    if (win) win.setSize(width, height, true);
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

  ipcMain.handle(IPC.CONNECTORS_GET_CONFIG, (_event, id: string) => {
    return ctx.engine.getConnectorConfig(id) ?? null;
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

  // --- Logs ---

  ipcMain.handle(IPC.LOGS_GET, (_event, { search }: { search?: string } = {}) => {
    return ctx.logCollector.getLines(search);
  });

  // --- Agent Orchestration ---

  ipcMain.handle(IPC.AGENTS_LIST, () => {
    return ctx.agentRegistry?.getAll() ?? [];
  });

  ipcMain.handle(IPC.AGENTS_REGISTER, (_event, info: AgentInfo) => {
    ctx.agentRegistry?.register(info);
    return { ok: true };
  });

  ipcMain.handle(IPC.AGENTS_UNREGISTER, (_event, agentId: string) => {
    return { ok: ctx.agentRegistry?.unregister(agentId) ?? false };
  });

  ipcMain.handle(IPC.AGENTS_UPDATE_STATUS, (_event, { agentId, status }: { agentId: string; status: AgentStatus }) => {
    return { ok: ctx.agentRegistry?.updateStatus(agentId, status) ?? false };
  });

  ipcMain.handle(IPC.AGENT_SPAWN, async (_event, opts: { name: string; profilePath?: string }) => {
    log('IPC', `AGENT_SPAWN called: name=${opts?.name}, profilePath=${opts?.profilePath}`);
    if (!ctx.agentLifecycle) return { ok: false, error: 'Experimental mode not enabled' };
    try {
      const agent = await ctx.agentLifecycle.spawnAgent(opts);
      return { ok: true, agent };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.AGENT_SEND_TEXT, async (_event, { agentId, text }: { agentId: string; text: string }) => {
    if (!ctx.agentLifecycle) return { ok: false, error: 'Experimental mode not enabled' };
    try {
      await ctx.agentLifecycle.sendTextToAgent(agentId, text);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.AGENT_FOCUS, async (_event, agentId: string) => {
    if (!ctx.agentLifecycle) return { ok: false, error: 'Experimental mode not enabled' };
    try {
      await ctx.agentLifecycle.focusAgent(agentId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.AGENT_MESSAGES_LIST, () => {
    return ctx.masterAgent?.getMessages() ?? [];
  });

  ipcMain.handle(IPC.MASTER_ROUTE_TASK, async (_event, { agentId, task }: { agentId: string; task: string }) => {
    if (!ctx.masterAgent) return { ok: false, error: 'Experimental mode not enabled' };
    try {
      await ctx.masterAgent.routeTask(agentId, task);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.MASTER_MESSAGES, () => {
    return ctx.masterAgent?.getMessages() ?? [];
  });

  // --- Profiles ---

  ipcMain.handle(IPC.PROFILES_LIST, () => {
    log('IPC', 'PROFILES_LIST called');
    const profilesDir = path.join(os.homedir(), '.idashboard', 'profiles');
    try {
      if (!fs.existsSync(profilesDir)) return [];
      const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.md')).sort();
      return files.map(f => ({
        name: f.replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        path: path.join(profilesDir, f),
      }));
    } catch {
      return [];
    }
  });

  // --- Connector Force Poll ---

  ipcMain.handle(IPC.CONNECTORS_FORCE_POLL, async (_event, connectorId: string) => {
    try {
      const events = await ctx.engine.forcePoll(connectorId);
      return { ok: true, count: events.length };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // --- Slack Bidirectional ---

  ipcMain.handle(IPC.SLACK_SEND, async (_event, { channel, text, threadTs }: { channel: string; text: string; threadTs?: string }) => {
    const slackId = findSlackConnectorId(ctx);
    if (!slackId) return { ok: false, error: 'No Slack connector found' };
    const connector = ctx.engine.getConnector(slackId);
    if (!(connector instanceof SlackConnector)) return { ok: false, error: 'Not a Slack connector' };
    try {
      return await connector.sendMessage(channel, text, threadTs);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(IPC.SLACK_CHANNELS, () => {
    const slackId = findSlackConnectorId(ctx);
    if (!slackId) return [];
    const connector = ctx.engine.getConnector(slackId);
    if (connector && connector instanceof SlackConnector) {
      return connector.getMonitoredChannels();
    }
    return [];
  });

  // --- Slack Bridge Hook Installation ---

  ipcMain.handle(IPC.SLACK_BRIDGE_INSTALL_HOOKS, () => {
    return installSlackBridgeHooks();
  });
}

/** Find the first Slack connector ID from engine statuses */
function findSlackConnectorId(ctx: IPCContext): string | undefined {
  const statuses = ctx.engine.getStatuses();
  return statuses.find(s => s.type === 'slack')?.id;
}

/** Install Claude Code hooks for the Slack bridge into ~/.claude/settings.json */
function installSlackBridgeHooks(): { ok: boolean; error?: string } {
  const hookScript = path.join(os.homedir(), '.idashboard', 'hooks', 'claude-bridge.py');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  if (!fs.existsSync(hookScript)) {
    return { ok: false, error: `Hook script not found at ${hookScript}` };
  }

  try {
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }

    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;

    // Claude Code hook format: each entry needs { hooks: [{ type, command }] }
    const bridgeHooks: Record<string, { hooks: Array<{ type: string; command: string }> }> = {
      Stop: { hooks: [{ type: 'command', command: `python3 ${hookScript} stop` }] },
      SubagentStop: { hooks: [{ type: 'command', command: `python3 ${hookScript} subagent-stop` }] },
      PostToolUse: { hooks: [{ type: 'command', command: `python3 ${hookScript} tool-use` }] },
      UserPromptSubmit: { hooks: [{ type: 'command', command: `python3 ${hookScript} user-prompt` }] },
    };

    for (const [hookType, hookDef] of Object.entries(bridgeHooks)) {
      const existing = (hooks[hookType] ?? []) as Array<Record<string, unknown>>;
      // Don't add duplicate — check if our command is already registered
      const alreadyInstalled = existing.some(h => {
        const innerHooks = h.hooks as Array<Record<string, unknown>> | undefined;
        if (!innerHooks) return typeof h.command === 'string' && (h.command as string).includes('claude-bridge.py');
        return innerHooks.some(ih => typeof ih.command === 'string' && (ih.command as string).includes('claude-bridge.py'));
      });
      if (!alreadyInstalled) {
        hooks[hookType] = [...existing, hookDef];
      }
    }

    settings.hooks = hooks;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    log('SlackBridge', 'Hooks installed in ~/.claude/settings.json');
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    warn('SlackBridge', `Failed to install hooks: ${msg}`);
    return { ok: false, error: msg };
  }
}

/** Push events to renderer process */
export function pushToRenderer(window: BrowserWindow | null, channel: string, data: unknown): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}
