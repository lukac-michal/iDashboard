// ============================================================
// AgentRegistry - Tracks registered agents and their status
// ============================================================

import { EventEmitter } from 'node:events';
import { log } from '@main/utils/log';
import type { AgentInfo, AgentStatus } from '@shared/types';

export class AgentRegistry extends EventEmitter {
  private agents = new Map<string, AgentInfo>();
  private staleThresholdMs: number;

  constructor(staleThresholdMs = 30000) {
    super();
    this.staleThresholdMs = staleThresholdMs;
  }

  register(info: AgentInfo): void {
    this.agents.set(info.id, { ...info, registeredAt: Date.now(), lastSeenAt: Date.now() });
    log('AgentRegistry', `Registered agent: ${info.id} (${info.name})`);
    this.emit('agent:registered', this.agents.get(info.id));
  }

  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    this.agents.delete(agentId);
    log('AgentRegistry', `Unregistered agent: ${agentId}`);
    this.emit('agent:unregistered', agent);
    return true;
  }

  updateStatus(agentId: string, status: AgentStatus): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.status = status;
    agent.lastSeenAt = Date.now();
    this.emit('agent:updated', agent);
    return true;
  }

  heartbeat(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.lastSeenAt = Date.now();
    if (agent.status === 'stale') {
      agent.status = 'online';
      this.emit('agent:updated', agent);
    }
    return true;
  }

  getAll(): AgentInfo[] {
    return [...this.agents.values()];
  }

  get(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  markStale(): string[] {
    const now = Date.now();
    const staleIds: string[] = [];
    for (const [id, agent] of this.agents) {
      if (agent.status !== 'offline' && now - agent.lastSeenAt > this.staleThresholdMs) {
        agent.status = 'stale';
        staleIds.push(id);
        this.emit('agent:updated', agent);
      }
    }
    if (staleIds.length > 0) {
      log('AgentRegistry', `Marked ${staleIds.length} agent(s) as stale`);
    }
    return staleIds;
  }

  setStaleThreshold(ms: number): void {
    this.staleThresholdMs = ms;
  }
}
