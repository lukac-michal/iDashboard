// ============================================================
// MasterAgentService - Routes tasks to sub-agents, logs comms
// ============================================================

import { EventEmitter } from 'node:events';
import { log } from '@main/utils/log';
import type { AgentLifecycleService } from './agent-lifecycle';
import type { AgentRegistry } from './agent-registry';
import type { ConnectorEngine } from '@main/connectors/engine';
import type { AgentMessage } from '@shared/types';

const MAX_MESSAGES = 1000;

export class MasterAgentService extends EventEmitter {
  private lifecycle: AgentLifecycleService;
  private registry: AgentRegistry;
  private connectorEngine?: ConnectorEngine;
  private messages: AgentMessage[] = [];

  constructor(lifecycle: AgentLifecycleService, registry: AgentRegistry, connectorEngine?: ConnectorEngine) {
    super();
    this.lifecycle = lifecycle;
    this.registry = registry;
    this.connectorEngine = connectorEngine;
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

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  private addMessage(message: AgentMessage): void {
    this.messages.push(message);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
    this.emit('message', message);
  }
}
