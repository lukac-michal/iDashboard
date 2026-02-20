// ============================================================
// Graylog Connector - Pull-based alert/log monitoring
// ============================================================

import { BaseConnector } from './base';
import type { ConnectorCapability, ConnectorEvent } from '@shared/types';

interface GraylogEvent {
  id: string;
  event_definition_id: string;
  event_definition_type: string;
  origin_context: string;
  timestamp: string;
  timestamp_processing: string;
  timerange_start?: string;
  timerange_end?: string;
  key?: string;
  key_tuple?: string[];
  priority: number; // 1=high, 2=normal, 3=low
  alert: boolean;
  message: string;
  fields?: Record<string, string>;
}

interface GraylogSearchResult {
  events: Array<{ event: GraylogEvent }>;
  total_events: number;
}

export class GraylogConnector extends BaseConnector {
  readonly type = 'graylog';
  readonly capabilities: ConnectorCapability[] = ['pull'];

  private baseUrl = '';
  private knownEventIds = new Set<string>();

  override async initialize(...args: Parameters<BaseConnector['initialize']>): Promise<void> {
    await super.initialize(...args);
    this.baseUrl = (this.config.settings.baseUrl as string ?? '').replace(/\/$/, '');
  }

  override async poll(): Promise<ConnectorEvent[]> {
    const events: ConnectorEvent[] = [];

    // Fetch active alerts
    const alertEvents = await this.fetchAlerts();
    for (const alert of alertEvents) {
      if (this.knownEventIds.has(alert.id)) continue;
      this.knownEventIds.add(alert.id);
      events.push(this.alertToEvent(alert));
    }

    // Trim
    if (this.knownEventIds.size > 500) {
      const arr = [...this.knownEventIds];
      this.knownEventIds = new Set(arr.slice(-250));
    }

    return events;
  }

  private async fetchAlerts(): Promise<GraylogEvent[]> {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const resp = await this.fetchWithAuth(`${this.baseUrl}/api/events/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '',
        filter: { alerts: 'only' },
        timerange: {
          type: 'absolute',
          from: fiveMinAgo.toISOString(),
          to: now.toISOString(),
        },
        page: 1,
        per_page: 20,
        sort_direction: 'desc',
        sort_by: 'timestamp',
      }),
    });

    if (!resp.ok) return [];

    const data = await resp.json() as GraylogSearchResult;
    return data.events?.map(e => e.event) ?? [];
  }

  private alertToEvent(alert: GraylogEvent): ConnectorEvent {
    const severity = this.mapPriority(alert.priority, alert.alert);

    return this.createEvent({
      severity,
      title: alert.message || `Graylog Alert ${alert.id.slice(0, 8)}`,
      body: alert.fields ? Object.entries(alert.fields).map(([k, v]) => `${k}: ${v}`).join(', ') : undefined,
      category: 'alert',
      eventType: alert.alert ? 'alert-triggered' : 'event-received',
      externalId: `graylog-${alert.id}`,
      metadata: {
        eventDefId: alert.event_definition_id,
        priority: alert.priority,
        isAlert: alert.alert,
        key: alert.key,
        originContext: alert.origin_context,
      },
      uiHints: {
        icon: 'search',
        color: severity === 'critical' ? '#ef4444'
          : severity === 'error' ? '#f97316'
          : severity === 'warning' ? '#f59e0b'
          : '#8b5cf6',
      },
    });
  }

  private mapPriority(priority: number, isAlert: boolean): ConnectorEvent['severity'] {
    if (isAlert && priority === 1) return 'critical';
    if (isAlert) return 'error';
    if (priority <= 2) return 'warning';
    return 'info';
  }
}
