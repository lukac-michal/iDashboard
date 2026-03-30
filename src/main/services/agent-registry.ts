// ============================================================
// AgentRegistry - Tracks registered agents and their status
// ============================================================

import { EventEmitter } from 'node:events';
import { log } from '@main/utils/log';
import type { AgentStore } from '@main/db/agent-store';
import type { AgentInfo, AgentStatus, AgentReportStatus } from '@shared/types';

export class AgentRegistry extends EventEmitter {
  private agents = new Map<string, AgentInfo>();
  private staleThresholdMs: number;
  private store?: AgentStore;

  constructor(staleThresholdMs = 30000, store?: AgentStore) {
    super();
    this.staleThresholdMs = staleThresholdMs;
    this.store = store;

    if (this.store) {
      const persisted = this.store.getAllAgents();
      for (const agent of persisted) {
        agent.status = 'stale';
        this.agents.set(agent.id, agent);
      }
      if (persisted.length > 0) {
        log('AgentRegistry', `Loaded ${persisted.length} agent(s) from DB (marked stale)`);
      }
    }
  }

  register(info: AgentInfo): void {
    const agent = { ...info, registeredAt: Date.now(), lastSeenAt: Date.now() };
    this.agents.set(info.id, agent);
    this.store?.upsertAgent(agent);
    log('AgentRegistry', `Registered agent: ${info.id} (${info.name})`);
    this.emit('agent:registered', this.agents.get(info.id));
  }

  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    this.agents.delete(agentId);
    this.store?.deleteAgent(agentId);
    log('AgentRegistry', `Unregistered agent: ${agentId}`);
    this.emit('agent:unregistered', agent);
    return true;
  }

  updateStatus(agentId: string, status: AgentStatus): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.status = status;
    agent.lastSeenAt = Date.now();
    this.store?.upsertAgent(agent);
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
    this.store?.upsertAgent(agent);
    return true;
  }

  getAll(): AgentInfo[] {
    return [...this.agents.values()];
  }

  get(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  findByName(name: string): AgentInfo | undefined {
    const lower = name.toLowerCase();
    let fallback: AgentInfo | undefined;
    for (const agent of this.agents.values()) {
      if (agent.name.toLowerCase() === lower) {
        // Prefer online/busy/idle agents over offline/stale ones
        if (agent.status !== 'offline' && agent.status !== 'stale') return agent;
        if (!fallback) fallback = agent;
      }
    }
    return fallback;
  }

  updateReport(agentId: string, status: AgentReportStatus, shortSummary: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.reportStatus = status;
    agent.shortSummary = shortSummary;
    agent.lastReportAt = Date.now();
    agent.lastSeenAt = Date.now();
    this.store?.upsertAgent(agent);
    this.emit('agent:updated', agent);
    return true;
  }

  markStale(): string[] {
    const now = Date.now();
    const staleIds: string[] = [];
    for (const [id, agent] of this.agents) {
      if (agent.status !== 'offline' && now - agent.lastSeenAt > this.staleThresholdMs) {
        agent.status = 'stale';
        staleIds.push(id);
        this.store?.upsertAgent(agent);
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
