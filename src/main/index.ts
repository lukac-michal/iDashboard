// ============================================================
// iDashboard - Main Process Entry Point
// ============================================================

import { app, net, safeStorage } from 'electron';
import * as path from 'node:path';
import * as os from 'node:os';

import { ConfigLoader } from './config/loader';
import { createDatabase } from './db/connection';
import { EventStore } from './db/event-store';
import { Aggregator } from './db/aggregator';
import { DatabaseMaintenance } from './db/maintenance';
import { ConnectorEngine } from './connectors/engine';
import { AuthManager } from './services/auth-manager';
import { NetworkReachabilityService } from './services/network-reachability';
import { SoundNotificationService } from './services/sound-notification';
import { TokenRefreshService } from './services/token-refresh';
import { RulesEngine } from './services/rules-engine';
import { KeyboardShortcutService } from './services/keyboard-shortcuts';
import { MultiMonitorService } from './services/multi-monitor';
import { DataExportService } from './services/data-export';
import { AutoUpdaterService } from './services/auto-updater';
import { ConnectorSDK } from './services/connector-sdk';
import { LayoutPersistenceService } from './services/layout-persistence';
import { ThemeManager } from './services/theme-manager';
import { WindowManager } from './window/manager';
import { TrayManager } from './window/tray';
import { registerIPCHandlers, pushToRenderer } from './ipc/channels';
import { createAPIServer, startAPIServer } from './api/server';
import { IPC } from '@shared/ipc-channels';
import { meetsMinSeverity } from '@shared/constants';
import { LogCollector } from './services/log-collector';
import { AgentRegistry } from './services/agent-registry';
import { ITerm2Adapter } from './services/iterm2-adapter';
import { AgentLifecycleService } from './services/agent-lifecycle';
import { MasterAgentService } from './services/master-agent';
import { log, warn, error as logError, setLogCollector } from './utils/log';
import type { ConnectorEvent, AppConfig, ConnectorConfig } from '@shared/types';

// Singleton instances
let config: AppConfig;
let connectorConfigs: ConnectorConfig[];
let windowManager: WindowManager;
let trayManager: TrayManager;
let connectorEngine: ConnectorEngine;
let eventStore: EventStore;
let networkService: NetworkReachabilityService;
let soundService: SoundNotificationService;
let tokenRefreshService: TokenRefreshService;
let rulesEngine: RulesEngine;
let shortcutService: KeyboardShortcutService;
let autoUpdater: AutoUpdaterService;
let configLoader: ConfigLoader;
let logCollector: LogCollector;
let agentRegistry: AgentRegistry | undefined;
let agentLifecycle: AgentLifecycleService | undefined;
let masterAgent: MasterAgentService | undefined;

async function bootstrap(): Promise<void> {
  // --- Log Collector (before anything else so all logs are captured) ---
  const logsDir = path.join(app.getPath('userData'), 'logs');
  logCollector = new LogCollector(logsDir);
  setLogCollector(logCollector);

  // --- Configuration ---
  const configDir = path.join(os.homedir(), '.idashboard');
  configLoader = new ConfigLoader(configDir);
  configLoader.ensureConfigDir();
  config = configLoader.loadAppConfig();
  connectorConfigs = configLoader.loadConnectors();

  log('Main', `Config loaded from ${configDir}`);
  log('Main', `Found ${connectorConfigs.length} connector config(s)`);

  // --- Database ---
  const dbPath = path.join(app.getPath('userData'), 'idashboard.db');
  const { db, sqlite } = createDatabase(dbPath);
  eventStore = new EventStore(db);
  const aggregator = new Aggregator(db);
  const maintenance = new DatabaseMaintenance(
    sqlite,
    eventStore,
    aggregator,
    config.storage.retentionDays,
    config.storage.aggregateRetentionDays,
    config.storage.vacuumIntervalHours,
  );
  maintenance.start();
  log('Main', `Database ready at ${dbPath}`);

  // --- Services requiring DB ---
  const layoutService = new LayoutPersistenceService(db);
  const themeManager = new ThemeManager(db);

  // --- Auth Manager ---
  const authManager = new AuthManager();
  if (safeStorage.isEncryptionAvailable()) {
    authManager.setSafeStorage(safeStorage);
  }

  // --- Token Refresh ---
  tokenRefreshService = new TokenRefreshService(authManager);
  tokenRefreshService.start();

  // --- Sound Notifications ---
  soundService = new SoundNotificationService();
  soundService.configure(config.notifications.sound);

  // --- Rules Engine ---
  rulesEngine = new RulesEngine();

  // --- Network Reachability ---
  networkService = new NetworkReachabilityService();
  networkService.initialize(net.isOnline());
  networkService.startVpnPolling(config.network.vpnInterfaceCheckIntervalSec * 1000);

  // Electron online/offline events via powerMonitor / polling
  setInterval(() => {
    const online = net.isOnline();
    const prev = networkService.isOnline;
    if (online !== prev) {
      networkService.setOnline(online);
      if (online) {
        connectorEngine.resumeAll();
      } else {
        connectorEngine.pauseAll();
      }
      pushToRenderer(windowManager.getWindow(), IPC.NETWORK_CHANGED, { state: online ? 'online' : 'offline' });
    }
  }, 5000);

  // --- Connector SDK (Plugins) ---
  const connectorSDK = new ConnectorSDK();
  const pluginDir = path.join(configDir, 'plugins');
  connectorSDK.setPluginDirs([pluginDir]);
  await connectorSDK.discoverPlugins();

  // --- Connector Engine ---
  connectorEngine = new ConnectorEngine(authManager);

  // Wire up event handling
  connectorEngine.onEvent((event: ConnectorEvent) => {
    log('Event', `Received: severity=${event.severity} title="${event.title}" connector=${event.connectorId}`);

    // Apply rules
    const processed = rulesEngine.evaluate(event);
    if (!processed) {
      log('Event', `Suppressed by rules engine: "${event.title}"`);
      return;
    }

    // Persist
    eventStore.insert(processed);
    aggregator.recordEvent(processed);

    // Push to renderer
    const win = windowManager.getWindow();
    if (win && !win.isDestroyed()) {
      pushToRenderer(win, IPC.EVENTS_STREAM, processed);
      log('Event', `Pushed to renderer: id=${processed.id}`);
    } else {
      warn('Event', 'Window not available, cannot push to renderer');
    }

    // Bridge Slack events into master agent message feed
    if (masterAgent && processed.connectorId) {
      const connStatus = connectorEngine.getStatuses().find(s => s.id === processed.connectorId);
      if (connStatus?.type === 'slack') {
        masterAgent.recordInboundMessage(
          `slack:${(processed.metadata?.channel as string) ?? 'unknown'}`,
          processed.body ?? processed.title,
        );
      }
    }

    // Surface window + play sound based on configured severity thresholds
    const popupMin = config.notifications.popupMinSeverity ?? 'attention';
    if (meetsMinSeverity(processed.severity, popupMin)) {
      log('Event', `Surfacing window (severity=${processed.severity} >= ${popupMin}): "${processed.title}"`);
      windowManager.surfaceForNotification();
      pushToRenderer(mainWindow, IPC.APP_NAVIGATE, 'dashboard');
      soundService.play(windowManager.getWindow());
      trayManager.setBadge(eventStore.getActive().filter(e =>
        meetsMinSeverity(e.severity, popupMin),
      ).length);
    }
  });

  // Start connectors
  for (const cc of connectorConfigs) {
    if (cc.enabled) {
      await connectorEngine.addConnector(cc);
    }
  }

  // --- Window ---
  const preloadPath = path.join(__dirname, '../preload/index.js');
  windowManager = new WindowManager(config.window, preloadPath);
  const mainWindow = windowManager.createWindow();

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Open DevTools with F12 (dev convenience)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // --- Tray ---
  trayManager = new TrayManager(windowManager);
  trayManager.create();

  // --- Data Export ---
  const exportService = new DataExportService(eventStore);

  // --- Keyboard Shortcuts ---
  shortcutService = new KeyboardShortcutService();
  shortcutService.onAction('toggle-visibility', () => {
    const win = windowManager.getWindow();
    if (win?.isVisible()) win.hide();
    else win?.show();
  });
  shortcutService.onAction('toggle-fullscreen', () => {
    const win = windowManager.getWindow();
    if (win) win.setFullScreen(!win.isFullScreen());
  });
  shortcutService.onAction('dismiss-all', () => {
    const active = eventStore.getActive();
    for (const e of active) eventStore.dismiss(e.id);
    pushToRenderer(mainWindow, IPC.EVENTS_STREAM, { type: 'refresh' });
  });
  shortcutService.onAction('refresh', () => {
    connectorEngine.pauseAll();
    connectorEngine.resumeAll();
  });
  shortcutService.registerGlobal(shortcutService.getDefaults());
  shortcutService.registerAppShortcuts(mainWindow, shortcutService.getDefaults());

  // --- Multi-Monitor ---
  const multiMonitor = new MultiMonitorService();
  multiMonitor.onDisplayChange(() => {
    log('Main', 'Display configuration changed');
  });

  // --- Experimental Mode: Agent Orchestration ---
  if (config.experimental?.enabled) {
    log('Main', 'Experimental mode enabled — initializing agent orchestration');
    agentRegistry = new AgentRegistry(config.experimental.healthCheckIntervalMs * 3);
    const iterm2Adapter = new ITerm2Adapter();
    agentLifecycle = new AgentLifecycleService(
      agentRegistry,
      iterm2Adapter,
      config.experimental.repoPath || process.cwd(),
    );
    masterAgent = new MasterAgentService(agentLifecycle, agentRegistry, connectorEngine);

    // Push agent updates to renderer
    agentRegistry.on('agent:registered', () => {
      pushToRenderer(mainWindow, IPC.AGENTS_STREAM, agentRegistry!.getAll());
    });
    agentRegistry.on('agent:updated', () => {
      pushToRenderer(mainWindow, IPC.AGENTS_STREAM, agentRegistry!.getAll());
    });
    agentRegistry.on('agent:unregistered', () => {
      pushToRenderer(mainWindow, IPC.AGENTS_STREAM, agentRegistry!.getAll());
    });

    // Push master agent messages to renderer
    masterAgent.on('message', (msg) => {
      pushToRenderer(mainWindow, IPC.AGENT_MESSAGES_STREAM, msg);
    });

    agentLifecycle.startHealthMonitoring(config.experimental.healthCheckIntervalMs);
  }

  // --- IPC ---
  registerIPCHandlers({
    engine: connectorEngine,
    eventStore,
    aggregator,
    windowManager,
    networkService,
    layoutService,
    themeManager,
    soundService,
    exportService,
    rulesEngine,
    logCollector,
    agentRegistry,
    agentLifecycle,
    masterAgent,
    getConfig: () => config,
    updateConfig: (partial) => {
      // Deep-merge one level: spread nested objects instead of replacing them
      const merged: Record<string, unknown> = { ...config };
      for (const [key, value] of Object.entries(partial)) {
        if (value && typeof value === 'object' && !Array.isArray(value) && (config as Record<string, unknown>)[key]) {
          merged[key] = { ...(config as Record<string, unknown>)[key] as object, ...value };
        } else {
          merged[key] = value;
        }
      }
      config = merged as AppConfig;
      if (partial.notifications?.sound) {
        soundService.configure(partial.notifications.sound as AppConfig['notifications']['sound']);
      }
      if (partial.startup?.appMode !== undefined) {
        if (partial.startup.appMode === 'menubar') {
          app.dock?.hide();
        } else {
          app.dock?.show();
          // Re-apply custom dock icon — macOS resets it after dock.show()
          if (process.platform === 'darwin') {
            const iconPath = path.join(__dirname, '../../resources/icon.png');
            app.dock?.setIcon(iconPath);
          }
        }
      }
      if (partial.startup?.launchAtLogin !== undefined) {
        app.setLoginItemSettings({ openAtLogin: partial.startup.launchAtLogin });
      }
      windowManager.updateConfig(config.window);
      pushToRenderer(mainWindow, IPC.CONFIG_CHANGED, config);
    },
    addConnector: async (cc) => {
      connectorConfigs.push(cc);
      await connectorEngine.addConnector(cc);
      configLoader.saveConnectors(connectorConfigs);
    },
    updateConnector: async (cc) => {
      const idx = connectorConfigs.findIndex(c => c.id === cc.id);
      if (idx >= 0) connectorConfigs[idx] = cc;
      await connectorEngine.addConnector(cc); // Re-add replaces
      configLoader.saveConnectors(connectorConfigs);
    },
    removeConnector: async (id) => {
      connectorConfigs = connectorConfigs.filter(c => c.id !== id);
      await connectorEngine.removeConnector(id);
      configLoader.saveConnectors(connectorConfigs);
    },
  });

  // --- API Server ---
  const apiServer = await createAPIServer({
    engine: connectorEngine,
    eventStore,
    aggregator,
    config,
    broadcastEvent: () => {},
  });
  await startAPIServer(apiServer, config.api.port, config.api.bind);

  // --- Auto-Updater ---
  autoUpdater = new AutoUpdaterService();
  autoUpdater.start(config.startup.checkForUpdates);

  // --- Config Hot-Reload ---
  configLoader.startWatching(
    (newConfig) => {
      config = newConfig;
      soundService.configure(newConfig.notifications.sound);
      windowManager.updateConfig(newConfig.window);
      pushToRenderer(mainWindow, IPC.CONFIG_CHANGED, newConfig);
    },
    async (newConnectors) => {
      connectorConfigs = newConnectors;
      await connectorEngine.reloadConnectors(newConnectors);
      pushToRenderer(mainWindow, IPC.CONNECTORS_LIST, connectorEngine.getStatuses());
    },
  );

  // Set dock icon in dev mode (production uses icon from app bundle)
  if (process.platform === 'darwin') {
    const dockIconPath = path.join(__dirname, '../../resources/icon.png');
    app.dock?.setIcon(dockIconPath);
  }

  // Apply app mode (dock vs menu bar)
  if (config.startup.appMode === 'menubar') {
    app.dock?.hide();
  }

  // Wire launch-at-login to OS
  app.setLoginItemSettings({ openAtLogin: config.startup.launchAtLogin });

  // Show or minimize based on config
  if (config.startup.startMinimized) {
    mainWindow.hide();
  } else {
    mainWindow.show();
  }

  log('Main', 'iDashboard ready');
}

// --- App Lifecycle ---

app.whenReady().then(bootstrap).catch((err) => {
  logError('Main', 'Bootstrap failed:', err);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS: clicking the dock icon should show the window
  const win = windowManager?.getWindow();
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
});

app.on('before-quit', async () => {
  agentLifecycle?.destroy();
  shortcutService?.destroy();
  tokenRefreshService?.stop();
  autoUpdater?.stop();
  await connectorEngine?.destroy();
  networkService?.stop();
  logCollector?.destroy();
});
