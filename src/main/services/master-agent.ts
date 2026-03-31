// ============================================================
// MasterAgentService - Routes tasks to sub-agents, logs comms
// ============================================================

import { EventEmitter } from 'node:events';
import { log } from '@main/utils/log';
import { traceMessage } from './tracing';
import type { AgentLifecycleService } from './agent-lifecycle';
import type { AgentRegistry } from './agent-registry';
import type { ConnectorEngine } from '@main/connectors/engine';
import type { AgentStore } from '@main/db/agent-store';
import type { AgentMessage } from '@shared/types';

const MAX_MESSAGES = 1000;

export class MasterAgentService extends EventEmitter {
  private lifecycle: AgentLifecycleService;
  private registry: AgentRegistry;
  private connectorEngine?: ConnectorEngine;
  private store?: AgentStore;
  private messages: AgentMessage[] = [];

  constructor(lifecycle: AgentLifecycleService, registry: AgentRegistry, connectorEngine?: ConnectorEngine, store?: AgentStore) {
    super();
    this.lifecycle = lifecycle;
    this.registry = registry;
    this.connectorEngine = connectorEngine;
    this.store = store;

    if (this.store) {
      const persisted = this.store.getMessages(MAX_MESSAGES);
      // Messages come back in desc order from DB, reverse for chronological
      this.messages = persisted.reverse();
      if (this.messages.length > 0) {
        log('MasterAgent', `Loaded ${this.messages.length} message(s) from DB`);
      }
    }
  }

  async routeTask(agentId: string, task: string): Promise<void> {
    const agent = this.registry.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    log('MasterAgent', `Routing task to ${agent.name}: ${task.slice(0, 80)}...`);
    await this.lifecycle.sendTextToAgent(agentId, task);

    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from: 'master',
      to: agent.name,
      body: task,
      timestamp: Date.now(),
      direction: 'outbound',
    };

    this.addMessage(message);
  }

  recordInboundMessage(fromAgentId: string, body: string): void {
    const agent = this.registry.get(fromAgentId);
    const fromName = agent?.name ?? fromAgentId;

    log('MasterAgent', `Inbound from ${fromName}: ${body.slice(0, 80)}...`);

    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from: fromName,
      to: 'master',
      body,
      timestamp: Date.now(),
      direction: 'inbound',
    };

    this.addMessage(message);
  }

  async sendToSlack(channel: string, text: string): Promise<void> {
    if (!this.connectorEngine) throw new Error('No connector engine available');

    const statuses = this.connectorEngine.getStatuses();
    const slackStatus = statuses.find(s => s.type === 'slack');
    if (!slackStatus) throw new Error('No Slack connector found');

    log('MasterAgent', `Sending to Slack ${channel}: ${text.slice(0, 80)}...`);
    await this.connectorEngine.executeAction(slackStatus.id, 'send-message', { channel, text });

    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from: 'master',
      to: `slack:${channel}`,
      body: text,
      timestamp: Date.now(),
      direction: 'outbound',
    };

    this.addMessage(message);
  }

  async sendMessage(from: string, to: string, body: string): Promise<AgentMessage> {
    log('MasterAgent', `Message from ${from} to ${to}: ${body.slice(0, 80)}...`);

    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from,
      to,
      body,
      timestamp: Date.now(),
      direction: 'outbound',
    };

    // Try to deliver to target agent's terminal
    const targetAgent = this.registry.findByName(to);
    if (targetAgent) {
      try {
        await this.lifecycle.sendTextToAgent(targetAgent.id, `[Message from ${from}]: ${body}`);
      } catch {
        // Agent may not have a session - still record message
      }
    }

    this.addMessage(message);
    return message;
  }

  getMessagesForAgent(agentName: string): AgentMessage[] {
    return this.messages.filter(m => m.from === agentName || m.to === agentName);
  }

  async broadcastMessage(from: string, body: string): Promise<void> {
    const agents = this.registry.getAll().filter(a => a.status !== 'offline');
    for (const agent of agents) {
      if (agent.name !== from) {
        await this.sendMessage(from, agent.name, body);
      }
    }
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  private addMessage(message: AgentMessage): void {
    this.messages.push(message);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
    this.store?.insertMessage(message);
    traceMessage(message.from, message.to, message.body);
    this.emit('message', message);
  }
}
