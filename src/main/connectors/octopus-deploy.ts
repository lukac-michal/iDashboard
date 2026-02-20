// ============================================================
// OctopusDeploy Connector - Pull-based deployment monitoring
// ============================================================

import { BaseConnector } from './base';
import type { ConnectorCapability, ConnectorEvent } from '@shared/types';

interface OctoDeployment {
  Id: string;
  ReleaseId: string;
  EnvironmentId: string;
  ProjectId: string;
  TaskId: string;
  Created: string;
  Name?: string;
  State?: string;
  Links?: Record<string, string>;
}

interface OctoTask {
  Id: string;
  State: string;
  IsCompleted: boolean;
  FinishedSuccessfully: boolean;
  HasWarningsOrErrors: boolean;
  Duration?: string;
  StartTime?: string;
  CompletedTime?: string;
  HasPendingInterruptions?: boolean;
}

export class OctopusDeployConnector extends BaseConnector {
  readonly type = 'octopus-deploy';
  readonly capabilities: ConnectorCapability[] = ['pull'];

  private baseUrl = '';
  private knownDeploymentIds = new Set<string>();

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);
    this.baseUrl = (this.config.settings.baseUrl as string ?? '').replace(/\/$/, '');
  }

  override async poll(): Promise<ConnectorEvent[]> {
    const events: ConnectorEvent[] = [];

    // Fetch recent deployments
    const resp = await this.fetchWithAuth(
      `${this.baseUrl}/api/deployments?take=10&orderby=Created desc`,
    );

    if (!resp.ok) return [];

    const data = await resp.json() as { Items?: OctoDeployment[] };
    const deployments = data.Items ?? [];

    for (const deployment of deployments) {
      if (this.knownDeploymentIds.has(deployment.Id)) continue;
      this.knownDeploymentIds.add(deployment.Id);

      // Get task details
      const task = await this.fetchTask(deployment.TaskId);
      if (!task) continue;

      const event = this.deploymentToEvent(deployment, task);
      if (event) events.push(event);
    }

    // Trim known IDs
    if (this.knownDeploymentIds.size > 200) {
      const arr = [...this.knownDeploymentIds];
      this.knownDeploymentIds = new Set(arr.slice(-100));
    }

    return events;
  }

  private async fetchTask(taskId: string): Promise<OctoTask | null> {
    const resp = await this.fetchWithAuth(`${this.baseUrl}/api/tasks/${taskId}`);
    if (!resp.ok) return null;
    return resp.json() as Promise<OctoTask>;
  }

  private deploymentToEvent(deployment: OctoDeployment, task: OctoTask): ConnectorEvent | null {
    let eventType: string;
    let severity: ConnectorEvent['severity'];

    if (task.HasPendingInterruptions) {
      eventType = 'guided-failure';
      severity = 'attention';
    } else if (task.FinishedSuccessfully) {
      eventType = 'deployment-succeeded';
      severity = 'info';
    } else if (task.IsCompleted && !task.FinishedSuccessfully) {
      eventType = 'deployment-failed';
      severity = 'critical';
    } else if (task.State === 'Executing') {
      eventType = 'deployment-started';
      severity = 'info';
    } else if (task.State === 'Queued') {
      eventType = 'deployment-queued';
      severity = 'info';
    } else {
      return null;
    }

    const duration = task.StartTime && task.CompletedTime
      ? new Date(task.CompletedTime).getTime() - new Date(task.StartTime).getTime()
      : undefined;

    const statusMap: Record<string, string> = {
      'deployment-succeeded': 'success',
      'deployment-failed': 'failure',
      'deployment-started': 'in_progress',
      'deployment-queued': 'in_progress',
      'guided-failure': 'in_progress',
    };

    return this.createEvent({
      severity,
      title: deployment.Name ?? `Deployment ${deployment.Id}`,
      body: task.HasPendingInterruptions
        ? 'Guided failure — needs human intervention'
        : `${task.State}${task.Duration ? ` (${task.Duration})` : ''}`,
      category: 'deploy',
      eventType,
      status: statusMap[eventType] ?? 'in_progress',
      durationMs: duration,
      externalId: `octo-${deployment.Id}`,
      metadata: {
        deploymentId: deployment.Id,
        releaseId: deployment.ReleaseId,
        environmentId: deployment.EnvironmentId,
        projectId: deployment.ProjectId,
        taskId: deployment.TaskId,
        taskState: task.State,
      },
      uiHints: {
        icon: 'rocket',
        color: severity === 'critical' ? '#ef4444'
          : severity === 'attention' ? '#f97316'
          : severity === 'info' ? '#22c55e'
          : '#6366f1',
        blinkDurationMs: severity === 'attention' ? 30_000 : undefined,
        actionButtons: severity === 'attention' ? [
          { id: 'open-octopus', label: 'Open in Octopus', icon: 'external-link', variant: 'primary' },
          { id: 'dismiss', label: 'Dismiss', icon: 'x' },
        ] : undefined,
      },
    });
  }
}
