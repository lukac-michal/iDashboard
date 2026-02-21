#!/usr/bin/env node
// ============================================================
// iDashboard CLI Tool
// Push events from the command line: idashboard push "message"
// ============================================================

import { DEFAULT_PORT, DEFAULT_BIND, API_PREFIX } from '@shared/constants';

const USAGE = `
iDashboard CLI

Usage:
  idashboard push <message> [options]
  idashboard status
  idashboard connectors
  idashboard help

Commands:
  push <message>    Push an event to the dashboard
  status            Show dashboard status
  connectors        List active connectors
  help              Show this help message

Push Options:
  --connector, -c   Connector ID (default: "cli")
  --severity, -s    Severity: info|warning|error|critical|attention (default: "info")
  --title, -t       Event title (default: message text)
  --body, -b        Event body
  --port, -p        API port (default: ${DEFAULT_PORT})
  --host, -h        API host (default: ${DEFAULT_BIND})

Examples:
  idashboard push "Build complete"
  idashboard push "Deploy failed" -s error -c deploy
  idashboard push --title "CI Pipeline" --body "All tests passed" -s info
`;

interface ParsedArgs {
  command: string;
  message?: string;
  connector: string;
  severity: string;
  title?: string;
  body?: string;
  port: number;
  host: string;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: args[0] ?? 'help',
    connector: 'cli',
    severity: 'info',
    port: DEFAULT_PORT,
    host: DEFAULT_BIND,
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--connector' || arg === '-c') {
      parsed.connector = args[++i] ?? 'cli';
    } else if (arg === '--severity' || arg === '-s') {
      parsed.severity = args[++i] ?? 'info';
    } else if (arg === '--title' || arg === '-t') {
      parsed.title = args[++i];
    } else if (arg === '--body' || arg === '-b') {
      parsed.body = args[++i];
    } else if (arg === '--port' || arg === '-p') {
      parsed.port = parseInt(args[++i], 10) || DEFAULT_PORT;
    } else if (arg === '--host' || arg === '-h') {
      parsed.host = args[++i] ?? DEFAULT_BIND;
    } else if (!parsed.message) {
      parsed.message = arg;
    }

    i++;
  }

  return parsed;
}

async function apiRequest(host: string, port: number, method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `http://${host}:${port}${API_PREFIX}${path}`;

  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function pushEvent(args: ParsedArgs): Promise<void> {
  if (!args.message && !args.title) {
    console.error('Error: Message or --title is required');
    process.exit(1);
  }

  const payload = {
    connector: args.connector,
    title: args.title ?? args.message,
    body: args.body ?? (args.title ? args.message : undefined),
    severity: args.severity,
  };

  try {
    const result = await apiRequest(args.host, args.port, 'POST', '/events/push', payload);
    console.log('Event pushed successfully');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Failed to push event:', err instanceof Error ? err.message : err);
    console.error(`Is iDashboard running on ${args.host}:${args.port}?`);
    process.exit(1);
  }
}

async function showStatus(args: ParsedArgs): Promise<void> {
  try {
    const result = await apiRequest(args.host, args.port, 'GET', '/health') as Record<string, unknown>;
    console.log('iDashboard Status:');
    console.log(`  Status: ${result.status}`);
    console.log(`  Uptime: ${result.uptime}`);
    console.log(`  Events: ${result.events}`);
    console.log(`  Connectors: ${result.connectors}`);
  } catch (err) {
    console.error('Dashboard not reachable:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

async function listConnectors(args: ParsedArgs): Promise<void> {
  try {
    const result = await apiRequest(args.host, args.port, 'GET', '/connectors') as { data: Array<{ id: string; type: string; displayName: string; connected: boolean }> };
    console.log('Active Connectors:');
    for (const c of result.data ?? []) {
      const status = c.connected ? '●' : '○';
      console.log(`  ${status} ${c.displayName} (${c.type}) [${c.id}]`);
    }
  } catch (err) {
    console.error('Dashboard not reachable:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'push':
      await pushEvent(args);
      break;
    case 'status':
      await showStatus(args);
      break;
    case 'connectors':
      await listConnectors(args);
      break;
    case 'help':
    default:
      console.log(USAGE);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
