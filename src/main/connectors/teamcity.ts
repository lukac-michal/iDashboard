// ============================================================
// TeamCity Connector - Pull-based CI/CD build monitoring
// ============================================================

import { BaseConnector } from './base';
import type { ConnectorCapability, ConnectorEvent } from '@shared/types';

interface TCBuild {
  id: number;
  buildTypeId: string;
  number?: string;
  status?: string;
  state?: string;
  statusText?: string;
  startDate?: string;
  finishDate?: string;
  webUrl?: string;
  buildType?: { name: string; projectName: string };
  running?: boolean;
  percentageComplete?: number;
}

interface TCBuildList {
  count: number;
  build?: TCBuild[];
}

export class TeamCityConnector extends BaseConnector {
  readonly type = 'teamcity';
  readonly capabilities: ConnectorCapability[] = ['pull'];

  private baseUrl = '';
  private knownBuildIds = new Set<number>();

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);
    this.baseUrl = (this.config.settings.baseUrl as string ?? '').replace(/\/$/, '');
  }

  override async poll(): Promise<ConnectorEvent[]> {
    const events: ConnectorEvent[] = [];

    // Poll running builds
    const running = await this.fetchBuilds('running:true');
    for (const build of running) {
      if (!this.knownBuildIds.has(build.id)) {
        this.knownBuildIds.add(build.id);
        events.push(this.buildToEvent(build, 'build-started', 'info'));
      }
    }

    // Poll recent failures
    const failures = await this.fetchBuilds('status:FAILURE,count:10');
    for (const build of failures) {
      if (!this.knownBuildIds.has(build.id)) {
        this.knownBuildIds.add(build.id);
        events.push(this.buildToEvent(build, 'build-failed', 'error'));
      }
    }

    // Trim known IDs to prevent unbounded growth
    if (this.knownBuildIds.size > 500) {
      const arr = [...this.knownBuildIds];
      this.knownBuildIds = new Set(arr.slice(-250));
    }

    return events;
  }

  private async fetchBuilds(locator: string): Promise<TCBuild[]> {
    const configFilter = this.config.settings.buildConfigs as string[] | undefined;
    let url = `${this.baseUrl}/app/rest/builds?locator=${locator}`;
    if (configFilter?.length) {
      url += `,buildType:(${configFilter.map(c => `id:${c}`).join(',')})`;
    }

    const resp = await this.fetchWithAuth(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!resp.ok) return [];

    const data = await resp.json() as TCBuildList;
    return data.build ?? [];
  }

  private buildToEvent(build: TCBuild, eventType: string, severity: ConnectorEvent['severity']): ConnectorEvent {
    const name = build.buildType?.name ?? build.buildTypeId;
    const project = build.buildType?.projectName ?? '';
    const title = project ? `${project} / ${name}` : name;
    const duration = build.startDate && build.finishDate
      ? new Date(build.finishDate).getTime() - new Date(build.startDate).getTime()
      : undefined;

    return this.createEvent({
      severity,
      title,
      body: build.statusText ?? `Build #${build.number ?? build.id}`,
      category: 'build',
      eventType,
      status: build.status === 'SUCCESS' ? 'success' : build.status === 'FAILURE' ? 'failure' : 'in_progress',
      durationMs: duration,
      sourceUrl: build.webUrl,
      externalId: `tc-build-${build.id}`,
      metadata: {
        buildId: build.id,
        buildTypeId: build.buildTypeId,
        buildNumber: build.number,
        percentageComplete: build.percentageComplete,
      },
      uiHints: {
        icon: 'hammer',
        color: severity === 'error' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#06b6d4',
      },
    });
  }
}
