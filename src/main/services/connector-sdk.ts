// ============================================================
// Connector SDK / Plugin System
// Allows loading third-party connectors from plugin directories
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import type {
  ConnectorConfig,
  ConnectorEvent,
  ConnectorCapability,
  ConnectorAction,
  ConnectorStatus,
} from '@shared/types';

/** Plugin manifest (plugin.json) */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  type: string; // connector type identifier
  capabilities: ConnectorCapability[];
  settings?: PluginSettingDef[];
  entryPoint: string; // relative JS file
}

export interface PluginSettingDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: unknown;
  options?: { label: string; value: string }[];
  description?: string;
  required?: boolean;
}

/** Interface that plugin connectors must implement */
export interface PluginConnectorInterface {
  initialize(config: ConnectorConfig): Promise<void>;
  poll?(): Promise<ConnectorEvent[]>;
  normalizeInbound?(raw: unknown): ConnectorEvent;
  getActions?(): ConnectorAction[];
  executeAction?(actionId: string, params?: unknown): Promise<void>;
  destroy?(): Promise<void>;
}

/** Loaded plugin metadata */
export interface LoadedPlugin {
  manifest: PluginManifest;
  dirPath: string;
  factory: () => PluginConnectorInterface;
}

export class ConnectorSDK {
  private plugins = new Map<string, LoadedPlugin>();
  private pluginDirs: string[] = [];

  /** Set directories to scan for plugins */
  setPluginDirs(dirs: string[]): void {
    this.pluginDirs = dirs;
  }

  /** Scan all plugin directories and load manifests */
  async discoverPlugins(): Promise<LoadedPlugin[]> {
    this.plugins.clear();

    for (const dir of this.pluginDirs) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginDir = path.join(dir, entry.name);
        try {
          const plugin = this.loadPlugin(pluginDir);
          if (plugin) {
            this.plugins.set(plugin.manifest.type, plugin);
            console.log(`[SDK] Loaded plugin: ${plugin.manifest.name} v${plugin.manifest.version}`);
          }
        } catch (err) {
          console.warn(`[SDK] Failed to load plugin from ${pluginDir}:`, err);
        }
      }
    }

    return [...this.plugins.values()];
  }

  /** Get a loaded plugin by connector type */
  getPlugin(type: string): LoadedPlugin | undefined {
    return this.plugins.get(type);
  }

  /** Get all loaded plugins */
  getAllPlugins(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /** Check if a connector type is provided by a plugin */
  hasPlugin(type: string): boolean {
    return this.plugins.has(type);
  }

  private loadPlugin(dirPath: string): LoadedPlugin | null {
    const manifestPath = path.join(dirPath, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return null;

    const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    if (!manifest.name || !manifest.type || !manifest.entryPoint) {
      console.warn(`[SDK] Invalid manifest in ${dirPath}`);
      return null;
    }

    const entryPath = path.join(dirPath, manifest.entryPoint);
    if (!fs.existsSync(entryPath)) {
      console.warn(`[SDK] Entry point not found: ${entryPath}`);
      return null;
    }

    const factory = (): PluginConnectorInterface => {
      const code = fs.readFileSync(entryPath, 'utf-8');

      // Create a sandboxed context for the plugin
      const sandbox = {
        module: { exports: {} as Record<string, unknown> },
        exports: {} as Record<string, unknown>,
        require: (mod: string) => {
          // Only allow safe built-in modules
          const allowed = ['url', 'querystring', 'path', 'crypto'];
          if (allowed.includes(mod)) {
            return require(mod);
          }
          throw new Error(`Plugin cannot require module: ${mod}`);
        },
        console: {
          log: (...args: unknown[]) => console.log(`[Plugin:${manifest.name}]`, ...args),
          warn: (...args: unknown[]) => console.warn(`[Plugin:${manifest.name}]`, ...args),
          error: (...args: unknown[]) => console.error(`[Plugin:${manifest.name}]`, ...args),
        },
        fetch: globalThis.fetch,
        URL: globalThis.URL,
        URLSearchParams: globalThis.URLSearchParams,
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        Buffer: globalThis.Buffer,
      };

      const context = vm.createContext(sandbox);
      vm.runInContext(code, context, { filename: entryPath, timeout: 5000 });

      const moduleExports = sandbox.module.exports as Record<string, unknown>;
      const Connector = (moduleExports.default ?? moduleExports.Connector) as
        new () => PluginConnectorInterface;

      if (!Connector || typeof Connector !== 'function') {
        throw new Error('Plugin must export a default class or Connector class');
      }

      return new Connector();
    };

    return { manifest, dirPath, factory };
  }
}
