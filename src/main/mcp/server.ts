#!/usr/bin/env node
// ============================================================
// iDashboard MCP Server - Exposes agent tools to Claude Code
// ============================================================
//
// This is a standalone Node.js process that communicates with
// iDashboard's Fastify REST API over HTTP. It is spawned by
// Claude Code using the MCP stdio transport.
//
// To use this MCP server with Claude Code, add to ~/.claude/settings.json:
// {
//   "mcpServers": {
//     "idashboard": {
//       "command": "node",
//       "args": ["<path-to-project>/dist/mcp-server.js"],
//       "env": { "IDASHBOARD_URL": "http://localhost:19280" }
//     }
//   }
// }

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const IDASHBOARD_URL = process.env.IDASHBOARD_URL || 'http://localhost:19280';
const API_PREFIX = '/api/v1';

// ------------------------------------------------------------
// HTTP helper
// ------------------------------------------------------------

export async function apiCall(
  path: string,
  method: string = 'GET',
  body?: unknown,
): Promise<unknown> {
  const url = `${IDASHBOARD_URL}${API_PREFIX}${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  return response.json();
}

// ------------------------------------------------------------
// Tool handler functions (exported for testability)
// ------------------------------------------------------------

export async function handleReportStatus(args: {
  agentName: string;
  status: string;
  summary: string;
  longSummary?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  await apiCall('/agent-report', 'POST', {
    agentName: args.agentName,
    status: args.status,
    shortSummary: args.summary,
    longSummary: args.longSummary,
  });
  return {
    content: [{ type: 'text', text: `Status reported: ${args.status} -- ${args.summary}` }],
  };
}

export async function handleListAgents(): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const url = `${IDASHBOARD_URL}${API_PREFIX}/agents`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    return {
      content: [{ type: 'text', text: 'Failed to list agents (endpoint may not be available)' }],
    };
  }
  const agents = (await response.json()) as Array<Record<string, unknown>>;
  const text =
    Array.isArray(agents) && agents.length > 0
      ? agents
          .map(
            (a) =>
              `- ${a.name} [${a.status}] ${a.reportStatus ? `(${a.reportStatus})` : ''} ${a.shortSummary || ''}`,
          )
          .join('\n')
      : 'No agents registered.';
  return { content: [{ type: 'text', text }] };
}

export async function handleCreateTask(args: {
  title: string;
  assignTo?: string;
  blockedBy?: string[];
  createdBy: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const result = (await apiCall('/tasks', 'POST', {
    title: args.title,
    createdBy: args.createdBy,
    assignTo: args.assignTo,
    blockedBy: args.blockedBy,
  })) as { task?: { id?: string } };
  const taskId = result.task?.id ?? 'unknown';
  return { content: [{ type: 'text', text: `Task created: ${taskId} -- ${args.title}` }] };
}

export async function handleClaimTask(args: {
  taskId: string;
  agentName: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const url = `${IDASHBOARD_URL}${API_PREFIX}/tasks/${args.taskId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress', assignedTo: args.agentName }),
  });
  if (!response.ok) {
    const err = (await response.json()) as Record<string, unknown>;
    return { content: [{ type: 'text', text: `Failed to claim task: ${err.error}` }] };
  }
  return {
    content: [{ type: 'text', text: `Task ${args.taskId} claimed by ${args.agentName}` }],
  };
}

export async function handleCompleteTask(args: {
  taskId: string;
  result?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const url = `${IDASHBOARD_URL}${API_PREFIX}/tasks/${args.taskId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed', result: args.result }),
  });
  if (!response.ok) {
    const err = (await response.json()) as Record<string, unknown>;
    return { content: [{ type: 'text', text: `Failed to complete task: ${err.error}` }] };
  }
  return { content: [{ type: 'text', text: `Task ${args.taskId} completed` }] };
}

export async function handleGetTasks(args: {
  status?: string;
  assignedTo?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status);
  if (args.assignedTo) params.set('assignedTo', args.assignedTo);
  const query = params.toString() ? `?${params.toString()}` : '';

  const url = `${IDASHBOARD_URL}${API_PREFIX}/tasks${query}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const tasks = (await response.json()) as Array<Record<string, unknown>>;

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { content: [{ type: 'text', text: 'No tasks found.' }] };
  }

  const text = tasks
    .map(
      (t) =>
        `- [${t.status}] ${t.id}: ${t.title}${t.assignedTo ? ` (${t.assignedTo})` : ''}`,
    )
    .join('\n');
  return { content: [{ type: 'text', text }] };
}

export async function handleSendMessage(args: {
  from: string;
  to: string;
  body: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  await apiCall('/messages', 'POST', { from: args.from, to: args.to, body: args.body });
  return { content: [{ type: 'text', text: `Message sent from ${args.from} to ${args.to}` }] };
}

// ------------------------------------------------------------
// MCP Server setup
// ------------------------------------------------------------

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'idashboard',
    version: '0.7.0',
  });

  // Tool: report_status
  server.tool(
    'report_status',
    'Report agent status to iDashboard. Replaces curl-based reporting.',
    {
      agentName: z.string().describe('The agent name as registered in iDashboard'),
      status: z
        .enum(['working', 'done', 'question', 'blocked', 'error'])
        .describe('Current agent status'),
      summary: z.string().max(120).describe('Short summary of current state (120 chars max)'),
      longSummary: z.string().optional().describe('Detailed summary for PM routing'),
    },
    async (args) => handleReportStatus(args),
  );

  // Tool: list_agents
  server.tool(
    'list_agents',
    'List all agents registered in iDashboard with their status and capabilities.',
    {},
    async () => handleListAgents(),
  );

  // Tool: create_task
  server.tool(
    'create_task',
    'Create a new task in iDashboard task board.',
    {
      title: z.string().describe('Task title'),
      assignTo: z.string().optional().describe('Agent name to assign to'),
      blockedBy: z.array(z.string()).optional().describe('Task IDs that must complete first'),
      createdBy: z.string().default('mcp-agent').describe('Who created this task'),
    },
    async (args) => handleCreateTask(args),
  );

  // Tool: claim_task
  server.tool(
    'claim_task',
    'Claim a pending task for yourself.',
    {
      taskId: z.string().describe('Task ID to claim'),
      agentName: z.string().describe('Your agent name'),
    },
    async (args) => handleClaimTask(args),
  );

  // Tool: complete_task
  server.tool(
    'complete_task',
    'Mark a task as completed with optional result.',
    {
      taskId: z.string().describe('Task ID to complete'),
      result: z.string().optional().describe('Task result or summary of work done'),
    },
    async (args) => handleCompleteTask(args),
  );

  // Tool: get_tasks
  server.tool(
    'get_tasks',
    'List tasks from iDashboard task board.',
    {
      status: z
        .enum(['pending', 'in_progress', 'completed'])
        .optional()
        .describe('Filter by status'),
      assignedTo: z.string().optional().describe('Filter by assigned agent'),
    },
    async (args) => handleGetTasks(args),
  );

  // Tool: send_message
  server.tool(
    'send_message',
    'Send a message to another agent through iDashboard.',
    {
      from: z.string().describe('Your agent name'),
      to: z.string().describe('Target agent name'),
      body: z.string().describe('Message body'),
    },
    async (args) => handleSendMessage(args),
  );

  return server;
}

// ------------------------------------------------------------
// Main entry point (only runs when executed directly)
// ------------------------------------------------------------

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only start when this file is the entry point
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('mcp-server.js') || process.argv[1].endsWith('server.ts'));

if (isMainModule) {
  main().catch((err) => {
    process.stderr.write(`MCP server error: ${err}\n`);
    process.exit(1);
  });
}
