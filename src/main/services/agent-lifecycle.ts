// ============================================================
// AgentLifecycleService - Spawn, monitor, and manage agents
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { log, warn } from '@main/utils/log';
import type { AgentRegistry } from './agent-registry';
import type { TerminalAdapter, TerminalSession } from './terminal-adapter';
import type { AgentInfo } from '@shared/types';

const PROMPT_DIR = path.join(os.tmpdir(), 'idash-prompts');

export interface SpawnOptions {
  name: string;
  profilePath?: string;
}

export class AgentLifecycleService {
  private registry: AgentRegistry;
  private adapter: TerminalAdapter;
  private repoPath: string;
  private apiPort: number;
  private sessionMap = new Map<string, TerminalSession>();
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(registry: AgentRegistry, adapter: TerminalAdapter, repoPath: string, apiPort: number = 19280) {
    this.registry = registry;
    this.adapter = adapter;
    this.repoPath = repoPath;
    this.apiPort = apiPort;
  }

  loadPreamble(agentName: string): string {
    const preamblePath = path.join(os.homedir(), '.idashboard', 'preambles', 'agent-preamble.md');
    try {
      const template = fs.readFileSync(preamblePath, 'utf-8');
      return template
        .replace(/\{\{AGENT_NAME\}\}/g, agentName)
        .replace(/\{\{PORT\}\}/g, String(this.apiPort));
    } catch {
      warn('AgentLifecycle', `Preamble not found at ${preamblePath}, spawning without preamble`);
      return '';
    }
  }

  async spawnAgent(opts: SpawnOptions): Promise<AgentInfo> {
    const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const preamble = this.loadPreamble(opts.name);
    let systemPrompt = preamble;

    if (opts.profilePath) {
      try {
        const profileContent = fs.readFileSync(opts.profilePath, 'utf-8');
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${profileContent}` : profileContent;
      } catch {
        warn('AgentLifecycle', `Profile not found at ${opts.profilePath}, using preamble only`);
      }
    }

    let command: string;
    if (systemPrompt) {
      // Write prompt to a temp file — avoids shell/AppleScript escaping issues with long strings
      if (!fs.existsSync(PROMPT_DIR)) fs.mkdirSync(PROMPT_DIR, { recursive: true });
      const promptFile = path.join(PROMPT_DIR, `${id}.md`);
      fs.writeFileSync(promptFile, systemPrompt, 'utf-8');
      command = `claude --append-system-prompt "$(cat ${promptFile})"`;
    } else {
      command = 'claude';
    }

    log('AgentLifecycle', `Spawning agent: ${opts.name} (${id}), command length: ${command.length}`);

    const session = await this.adapter.createTab({
      name: opts.name,
      cwd: this.repoPath,
      command,
    });

    // Store session mapping with the agent name for later lookup
    session.name = opts.name;
    this.sessionMap.set(id, session);

    const agent: AgentInfo = {
      id,
      name: opts.name,
      status: 'online',
      profilePath: opts.profilePath,
      sessionName: opts.name,
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    this.registry.register(agent);
    return agent;
  }

  async sendTextToAgent(agentId: string, text: string): Promise<void> {
    const session = this.sessionMap.get(agentId);
    if (!session) throw new Error(`No session found for agent ${agentId}`);
    log('AgentLifecycle', `Sending text to ${agentId}: ${text.slice(0, 80)}...`);
    await this.adapter.writeText(session, text);
  }

  async terminateAgent(agentId: string): Promise<void> {
    const session = this.sessionMap.get(agentId);
    if (!session) {
      // No session but might still be in registry -- clean up
      this.registry.unregister(agentId);
      return;
    }

    log('AgentLifecycle', `Terminating agent: ${agentId} (${session.name})`);

    // Use adapter.terminate if available (PTY adapter), otherwise try closing via adapter
    if (this.adapter.terminate) {
      await this.adapter.terminate(session);
    }

    // Clean up
    this.sessionMap.delete(agentId);
    this.registry.unregister(agentId);

    // Clean up temp prompt file
    const promptFile = path.join(PROMPT_DIR, `${agentId}.md`);
    try { fs.unlinkSync(promptFile); } catch { /* file may not exist */ }
  }

  async recoverAgents(): Promise<void> {
    const agents = this.registry.getAll();
    if (agents.length === 0) return;

    log('AgentLifecycle', `Recovering ${agents.length} agent(s) from previous session`);

    const running = await this.adapter.isRunning();
    if (!running) {
      // Terminal not running -- mark all as offline
      for (const agent of agents) {
        this.registry.updateStatus(agent.id, 'offline');
      }
      log('AgentLifecycle', 'Terminal not running, all agents marked offline');
      return;
    }

    const sessions = await this.adapter.listSessions();

    for (const agent of agents) {
      // Try to find matching terminal session
      const matchedSession = sessions.find(s =>
        s.name === agent.sessionName || s.name === agent.name
      );

      if (matchedSession) {
        this.sessionMap.set(agent.id, matchedSession);
        this.registry.updateStatus(agent.id, 'stale'); // needs heartbeat to confirm
        log('AgentLifecycle', `Recovered session for agent ${agent.name}`);
      } else {
        this.registry.updateStatus(agent.id, 'offline');
        log('AgentLifecycle', `No session found for agent ${agent.name}, marked offline`);
      }
    }
  }

  async focusAgent(agentId: string): Promise<void> {
    const session = this.sessionMap.get(agentId);
    if (!session) throw new Error(`No session found for agent ${agentId}`);
    await this.adapter.focusSession(session);
    await this.adapter.activate();
  }

  /**
   * Match an iTerm2 session ID (from ITERM_SESSION_ID env var, format "w0t3p0:GUID")
   * to a spawned agent. Returns the agent ID if found.
   */
  findAgentByTerminalId(itermSessionId: string): string | undefined {
    // Extract GUID from "w0t3p0:GUID" format
    const guid = itermSessionId.includes(':')
      ? itermSessionId.split(':').slice(1).join(':')
      : itermSessionId;
    if (!guid) return undefined;

    for (const [agentId, session] of this.sessionMap) {
      if (session.sessionId && session.sessionId === guid) {
        return agentId;
      }
    }
    return undefined;
  }

  startHealthMonitoring(intervalMs: number): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    log('AgentLifecycle', `Starting health monitoring every ${intervalMs}ms`);

    this.healthTimer = setInterval(async () => {
      const running = await this.adapter.isRunning();
      if (!running) {
        // Mark all agents offline if terminal is not running
        for (const agent of this.registry.getAll()) {
          if (agent.status !== 'offline') {
            this.registry.updateStatus(agent.id, 'offline');
          }
        }
        return;
      }

      const sessions = await this.adapter.listSessions();

      for (const [agentId, session] of this.sessionMap) {
        const agent = this.registry.get(agentId);
        if (!agent || agent.status === 'offline') continue;

        // Match by unique session ID
        const found = session.sessionId
          ? sessions.some(s => s.sessionId === session.sessionId)
          : sessions.some(s => s.windowId === session.windowId && s.tabId === session.tabId);
        if (found) {
          this.registry.heartbeat(agentId);
        } else {
          warn('AgentLifecycle', `Agent tab w${session.windowId}t${session.tabId} not found, marking offline`);
          this.registry.updateStatus(agentId, 'offline');
        }
      }

      // Also mark stale agents
      this.registry.markStale();
    }, intervalMs);
  }

  stopHealthMonitoring(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  destroy(): void {
    this.stopHealthMonitoring();
    this.sessionMap.clear();
  }
}
