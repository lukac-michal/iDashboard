// ============================================================
// Generic HTTP Connector - Config-only REST API polling
// ============================================================

import { BaseConnector } from './base';
import type { ConnectorCapability, ConnectorEvent } from '@shared/types';

export class GenericHttpConnector extends BaseConnector {
  readonly type = 'generic-http';
  readonly capabilities: ConnectorCapability[] = ['pull'];

  override async poll(): Promise<ConnectorEvent[]> {
    const url = this.config.settings.url as string;
    const method = (this.config.settings.method as string ?? 'GET').toUpperCase();
    const expectedStatus = this.config.settings.expectedStatus as number ?? 200;
    const extractTitle = this.config.settings.extractTitle as string | undefined;
    const extractBody = this.config.settings.extractBody as string | undefined;
    const severityMapping = this.config.settings.severityMapping as Record<string, string> | undefined;
    const requestBody = this.config.settings.requestBody as unknown;

    const resp = await this.fetchWithAuth(url, {
      method,
      headers: requestBody ? { 'Content-Type': 'application/json' } : {},
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });

    const statusMatch = resp.status === expectedStatus;
    let data: unknown = null;

    try {
      data = await resp.json();
    } catch {
      // Response might not be JSON
    }

    const title = extractTitle ? jsonPath(data, extractTitle) ?? resp.statusText : resp.statusText;
    const body = extractBody ? jsonPath(data, extractBody) ?? '' : '';

    let severity: ConnectorEvent['severity'] = statusMatch ? 'info' : 'error';
    if (severityMapping && typeof title === 'string') {
      const mapped = severityMapping[title] ?? severityMapping[String(resp.status)];
      if (mapped) severity = mapped as ConnectorEvent['severity'];
    }

    return [this.createEvent({
      severity,
      title: String(title),
      body: String(body),
      category: 'health',
      eventType: statusMatch ? 'health-ok' : 'health-fail',
      status: statusMatch ? 'success' : 'failure',
      metadata: {
        url,
        httpStatus: resp.status,
        expectedStatus,
      },
      uiHints: {
        icon: 'globe',
        color: severity === 'info' ? '#22c55e'
          : severity === 'warning' ? '#f59e0b'
          : '#ef4444',
      },
    })];
  }
}

/** Simple JSONPath extraction: $.foo.bar or $.foo[0].bar */
function jsonPath(data: unknown, path: string): unknown {
  if (!data || !path.startsWith('$.')) return undefined;

  const parts = path.slice(2).split(/\.|\[(\d+)\]/).filter(Boolean);
  let current: unknown = data;

  for (const part of parts) {
    if (current == null) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}
