// ============================================================
// AgentLifecycleService - Spawn, monitor, and manage agents
// ============================================================

import { log, warn } from '@main/utils/log';
import type { AgentRegistry } from './agent-registry';
import type { TerminalAdapter, TerminalSession } from './terminal-adapter';
import type { AgentInfo } from '@shared/types';

export interface SpawnOptions {
  name: string;
  profilePath?: string;
}

export class AgentLifecycleService {
  private registry: AgentRegistry;
  private adapter: TerminalAdapter;
  private repoPath: string;
  private sessionMap = new Map<string, TerminalSession>();
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(registry: AgentRegistry, adapter: TerminalAdapter, repoPath: string) {
    this.registry = registry;
    this.adapter = adapter;
    this.repoPath = repoPath;
  }

  async spawnAgent(opts: SpawnOptions): Promise<AgentInfo> {
    const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const command = opts.profilePath
      ? `claude --profile ${JSON.stringify(opts.profilePath)}`
      : 'claude';

    log('AgentLifecycle', `Spawning agent: ${opts.name} (${id}), command: ${command}`);

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

  async focusAgent(agentId: string): Promise<void> {
    const session = this.sessionMap.get(agentId);
    if (!session) throw new Error(`No session found for agent ${agentId}`);
    await this.adapter.focusSession(session);
    await this.adapter.activate();
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
      const sessionNames = sessions.map(s => s.name);

      for (const [agentId, session] of this.sessionMap) {
        const agent = this.registry.get(agentId);
        if (!agent || agent.status === 'offline') continue;

        const found = sessionNames.some(n => n.includes(session.name));
        if (found) {
          this.registry.heartbeat(agentId);
        } else {
          warn('AgentLifecycle', `Agent session "${session.name}" not found, marking offline`);
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
