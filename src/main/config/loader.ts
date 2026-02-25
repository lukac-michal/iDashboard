// ============================================================
// Configuration Loader
// YAML parsing, env variable substitution, hot-reload
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { appConfigSchema, connectorConfigSchema } from './schema';
import { DEFAULT_CONFIG } from './defaults';
import type { AppConfig, ConnectorConfig } from '@shared/types';

const ENV_VAR_PATTERN = /\$\{(\w+)\}/g;

function substituteEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_, varName) => {
    return process.env[varName] ?? '';
  });
}

function deepSubstitute(obj: unknown): unknown {
  if (typeof obj === 'string') return substituteEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(deepSubstitute);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = deepSubstitute(val);
    }
    return result;
  }
  return obj;
}

export class ConfigLoader {
  private configDir: string;
  private watchers: fs.FSWatcher[] = [];
  private onConfigChange?: (config: AppConfig) => void;
  private onConnectorsChange?: (connectors: ConnectorConfig[]) => void;

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  getConfigDir(): string {
    return this.configDir;
  }

  loadAppConfig(): AppConfig {
    const configPath = path.join(this.configDir, 'config.yaml');

    if (!fs.existsSync(configPath)) {
      return DEFAULT_CONFIG;
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = yaml.load(raw) as Record<string, unknown>;
      const substituted = deepSubstitute(parsed);
      const validated = appConfigSchema.parse(substituted);
      const config = validated as AppConfig;

      // Backward-compat: migrate legacy forwardStopMessages → per-event toggles
      const rawBridge = (substituted as Record<string, unknown>)?.slackBridge as Record<string, unknown> | undefined;
      if (rawBridge && typeof rawBridge.forwardStopMessages === 'boolean') {
        const legacy = rawBridge.forwardStopMessages as boolean;
        // Only migrate if the new fields weren't explicitly set in the YAML
        if (rawBridge.forwardStop === undefined) config.slackBridge.forwardStop = legacy;
        if (rawBridge.forwardSubagentStop === undefined) config.slackBridge.forwardSubagentStop = legacy;
        if (rawBridge.forwardTaskComplete === undefined) config.slackBridge.forwardTaskComplete = legacy;
        delete config.slackBridge.forwardStopMessages;
      }

      return config;
    } catch (err) {
      console.error(`[Config] Failed to load ${configPath}:`, err);
      return DEFAULT_CONFIG;
    }
  }

  loadConnectors(): ConnectorConfig[] {
    const connectorsDir = path.join(this.configDir, 'connectors');

    if (!fs.existsSync(connectorsDir)) {
      return [];
    }

    const files = fs.readdirSync(connectorsDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    const connectors: ConnectorConfig[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(connectorsDir, file), 'utf-8');
        const parsed = yaml.load(raw) as Record<string, unknown>;
        const substituted = deepSubstitute(parsed);
        const validated = connectorConfigSchema.parse(substituted);
        connectors.push(validated as ConnectorConfig);
      } catch (err) {
        console.error(`[Config] Failed to load connector ${file}:`, err);
      }
    }

    return connectors.sort((a, b) => (a.ui.priority ?? 10) - (b.ui.priority ?? 10));
  }

  /** Save connector configs to individual YAML files */
  saveConnectors(connectors: ConnectorConfig[]): void {
    const connectorsDir = path.join(this.configDir, 'connectors');
    fs.mkdirSync(connectorsDir, { recursive: true });

    for (const connector of connectors) {
      const filePath = path.join(connectorsDir, `${connector.id}.yaml`);
      const yamlStr = yaml.dump(connector, { lineWidth: 120 });
      fs.writeFileSync(filePath, yamlStr, 'utf-8');
    }

    // Remove config files for connectors that no longer exist
    const validIds = new Set(connectors.map(c => `${c.id}.yaml`));
    const files = fs.readdirSync(connectorsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const file of files) {
      if (!validIds.has(file)) {
        fs.unlinkSync(path.join(connectorsDir, file));
      }
    }
  }

  /** Save app config to config.yaml (note: YAML comments will not be preserved) */
  saveAppConfig(config: AppConfig): void {
    const configPath = path.join(this.configDir, 'config.yaml');
    const yamlStr = yaml.dump(config as Record<string, unknown>, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
    fs.writeFileSync(configPath, yamlStr, 'utf-8');
  }

  ensureConfigDir(): void {
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.mkdirSync(path.join(this.configDir, 'connectors'), { recursive: true });
    fs.mkdirSync(path.join(this.configDir, 'layouts'), { recursive: true });
    fs.mkdirSync(path.join(this.configDir, 'themes'), { recursive: true });
    fs.mkdirSync(path.join(this.configDir, 'plugins'), { recursive: true });
  }

  startWatching(
    onConfigChange: (config: AppConfig) => void,
    onConnectorsChange: (connectors: ConnectorConfig[]) => void,
  ): void {
    this.onConfigChange = onConfigChange;
    this.onConnectorsChange = onConnectorsChange;

    const configPath = path.join(this.configDir, 'config.yaml');
    const connectorsDir = path.join(this.configDir, 'connectors');

    // Watch main config
    if (fs.existsSync(configPath)) {
      const watcher = fs.watch(configPath, debounce(() => {
        console.log('[Config] config.yaml changed, reloading...');
        const config = this.loadAppConfig();
        this.onConfigChange?.(config);
      }, 500));
      this.watchers.push(watcher);
    }

    // Watch connectors directory
    if (fs.existsSync(connectorsDir)) {
      const watcher = fs.watch(connectorsDir, debounce(() => {
        console.log('[Config] connectors/ changed, reloading...');
        const connectors = this.loadConnectors();
        this.onConnectorsChange?.(connectors);
      }, 500));
      this.watchers.push(watcher);
    }
  }

  stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
