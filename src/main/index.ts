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
import { WindowManager } from './window/manager';
import { TrayManager } from './window/tray';
import { registerIPCHandlers, pushToRenderer } from './ipc/channels';
import { createAPIServer, startAPIServer } from './api/server';
import { IPC } from '@shared/ipc-channels';
import type { ConnectorEvent, AppConfig } from '@shared/types';

// Singleton instances
let config: AppConfig;
let windowManager: WindowManager;
let trayManager: TrayManager;
let connectorEngine: ConnectorEngine;
let eventStore: EventStore;
let networkService: NetworkReachabilityService;

async function bootstrap(): Promise<void> {
  // --- Configuration ---
  const configDir = path.join(os.homedir(), '.idashboard');
  const configLoader = new ConfigLoader(configDir);
  configLoader.ensureConfigDir();
  config = configLoader.loadAppConfig();
  const connectorConfigs = configLoader.loadConnectors();

  console.log(`[Main] Config loaded from ${configDir}`);
  console.log(`[Main] Found ${connectorConfigs.length} connector config(s)`);

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
  console.log(`[Main] Database ready at ${dbPath}`);

  // --- Auth Manager ---
  const authManager = new AuthManager();
  if (safeStorage.isEncryptionAvailable()) {
    authManager.setSafeStorage(safeStorage);
  }

  // --- Network Reachability ---
  networkService = new NetworkReachabilityService();
  networkService.initialize(net.isOnline());
  networkService.startVpnPolling(config.network.vpnInterfaceCheckIntervalSec * 1000);

  // Electron online/offline events
  net.on('online', () => {
    networkService.setOnline(true);
    connectorEngine.resumeAll();
    pushToRenderer(windowManager.getWindow(), IPC.NETWORK_CHANGED, { state: 'online' });
  });
  net.on('offline', () => {
    networkService.setOnline(false);
    connectorEngine.pauseAll();
    pushToRenderer(windowManager.getWindow(), IPC.NETWORK_CHANGED, { state: 'offline' });
  });

  // --- Connector Engine ---
  connectorEngine = new ConnectorEngine(authManager);

  // Wire up event handling
  connectorEngine.onEvent((event: ConnectorEvent) => {
    // Persist
    eventStore.insert(event);
    aggregator.recordEvent(event);

    // Push to renderer
    pushToRenderer(windowManager.getWindow(), IPC.EVENTS_STREAM, event);

    // Surface window for attention events
    if (event.severity === 'attention' || event.severity === 'critical') {
      windowManager.surfaceForNotification();
      trayManager.setBadge(eventStore.getActive().filter(e =>
        e.severity === 'attention' || e.severity === 'critical',
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
  windowManager = new WindowManager(config.window);
  const mainWindow = windowManager.createWindow();

  // Set preload
  // In development, electron-vite handles this
  const preloadPath = path.join(__dirname, '../preload/index.js');
  mainWindow.webContents.session.setPreloads([preloadPath]);

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // --- Tray ---
  trayManager = new TrayManager(windowManager);
  trayManager.create();

  // --- IPC ---
  registerIPCHandlers({
    engine: connectorEngine,
    eventStore,
    windowManager,
    networkService,
    getConfig: () => config,
  });

  // --- API Server ---
  const apiServer = await createAPIServer({
    engine: connectorEngine,
    eventStore,
    aggregator,
    config,
    broadcastEvent: () => {}, // Set by websocket module
  });
  await startAPIServer(apiServer, config.api.port, config.api.bind);

  // --- Config Hot-Reload ---
  configLoader.startWatching(
    (newConfig) => {
      config = newConfig;
      windowManager.updateConfig(newConfig.window);
      pushToRenderer(mainWindow, IPC.CONFIG_CHANGED, newConfig);
    },
    async (newConnectors) => {
      await connectorEngine.reloadConnectors(newConnectors);
      pushToRenderer(mainWindow, IPC.CONNECTORS_LIST, connectorEngine.getStatuses());
    },
  );

  // Show or minimize based on config
  if (config.startup.startMinimized) {
    mainWindow.hide();
  } else {
    mainWindow.show();
  }

  console.log('[Main] iDashboard ready');
}

// --- App Lifecycle ---

app.whenReady().then(bootstrap).catch((err) => {
  console.error('[Main] Bootstrap failed:', err);
  app.quit();
});

app.on('window-all-closed', () => {
  // On macOS, keep running in tray
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await connectorEngine?.destroy();
  networkService?.stop();
});
