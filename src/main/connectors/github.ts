// ============================================================
// GitHub Actions Connector - Pull-based workflow monitoring
// ============================================================

import { BaseConnector } from './base';
import type { ConnectorCapability, ConnectorEvent } from '@shared/types';

interface GHWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  run_number: number;
  repository?: { full_name: string };
  head_commit?: { message: string; author: { name: string } };
}

interface GHRunsResponse {
  total_count: number;
  workflow_runs: GHWorkflowRun[];
}

export class GitHubConnector extends BaseConnector {
  readonly type = 'github';
  readonly capabilities: ConnectorCapability[] = ['pull'];

  private repos: string[] = [];
  private knownRunIds = new Set<number>();

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);
    this.repos = (this.config.settings.repos as string[]) ?? [];
  }

  override async poll(): Promise<ConnectorEvent[]> {
    const events: ConnectorEvent[] = [];

    for (const repo of this.repos) {
      const monitorWorkflows = this.config.settings.monitorWorkflows !== false;
      const monitorChecks = this.config.settings.monitorChecks === true;
      const failureOnly = this.config.settings.failureOnly === true;

      if (monitorWorkflows) {
        const runs = await this.fetchWorkflowRuns(repo);
        for (const run of runs) {
          if (this.knownRunIds.has(run.id)) continue;
          this.knownRunIds.add(run.id);

          if (failureOnly && run.conclusion !== 'failure') continue;

          events.push(this.runToEvent(run, repo));
        }
      }
    }

    // Trim
    if (this.knownRunIds.size > 500) {
      const arr = [...this.knownRunIds];
      this.knownRunIds = new Set(arr.slice(-250));
    }

    return events;
  }

  private async fetchWorkflowRuns(repo: string): Promise<GHWorkflowRun[]> {
    const resp = await this.fetchWithAuth(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=10`,
      { headers: { 'X-GitHub-Api-Version': '2022-11-28' } },
    );

    if (!resp.ok) return [];

    const data = await resp.json() as GHRunsResponse;
    return data.workflow_runs ?? [];
  }

  private runToEvent(run: GHWorkflowRun, repo: string): ConnectorEvent {
    let eventType: string;
    let severity: ConnectorEvent['severity'];

    switch (run.conclusion) {
      case 'success':
        eventType = 'workflow-succeeded';
        severity = 'info';
        break;
      case 'failure':
        eventType = 'workflow-failed';
        severity = 'error';
        break;
      case 'cancelled':
        eventType = 'workflow-cancelled';
        severity = 'warning';
        break;
      default:
        if (run.status === 'in_progress' || run.status === 'queued') {
          eventType = 'workflow-started';
          severity = 'info';
        } else {
          eventType = `workflow-${run.status}`;
          severity = 'info';
        }
    }

    const duration = run.run_started_at && run.conclusion
      ? new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()
      : undefined;

    return this.createEvent({
      severity,
      title: `${repo}: ${run.name}`,
      body: `#${run.run_number} on ${run.head_branch}${run.head_commit ? ` — ${run.head_commit.message.split('\n')[0]}` : ''}`,
      category: 'build',
      eventType,
      status: run.conclusion === 'success' ? 'success'
        : run.conclusion === 'failure' ? 'failure'
        : run.conclusion === 'cancelled' ? 'cancelled'
        : 'in_progress',
      durationMs: duration,
      sourceUrl: run.html_url,
      externalId: `gh-run-${run.id}`,
      metadata: {
        runId: run.id,
        runNumber: run.run_number,
        repo,
        branch: run.head_branch,
        status: run.status,
        conclusion: run.conclusion,
      },
      uiHints: {
        icon: 'github',
        color: severity === 'error' ? '#ef4444'
          : severity === 'warning' ? '#f59e0b'
          : '#8b5cf6',
      },
    });
  }
}
