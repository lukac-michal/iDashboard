// ============================================================
// Data Export Service
// Exports events as CSV or JSON
// ============================================================

import { dialog, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import type { EventStore } from '@main/db/event-store';
import type { ExportOptions, ConnectorEvent } from '@shared/types';

export class DataExportService {
  constructor(private eventStore: EventStore) {}

  /** Export events with file picker dialog */
  async exportWithDialog(window: BrowserWindow, options: ExportOptions): Promise<string | null> {
    const ext = options.format === 'csv' ? 'csv' : 'json';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    const result = await dialog.showSaveDialog(window, {
      defaultPath: `idashboard-export-${timestamp}.${ext}`,
      filters: [
        options.format === 'csv'
          ? { name: 'CSV Files', extensions: ['csv'] }
          : { name: 'JSON Files', extensions: ['json'] },
      ],
    });

    if (result.canceled || !result.filePath) return null;

    const events = this.fetchEvents(options);
    const content = options.format === 'csv'
      ? this.toCsv(events, options.includeMetadata ?? false)
      : this.toJson(events, options.includeMetadata ?? false);

    fs.writeFileSync(result.filePath, content, 'utf-8');
    return result.filePath;
  }

  /** Export events to a string (for API export) */
  exportToString(options: ExportOptions): string {
    const events = this.fetchEvents(options);
    return options.format === 'csv'
      ? this.toCsv(events, options.includeMetadata ?? false)
      : this.toJson(events, options.includeMetadata ?? false);
  }

  private fetchEvents(options: ExportOptions): ConnectorEvent[] {
    const limit = options.maxRows ?? 10_000;
    let events = this.eventStore.getRecent(limit, options.fromTimestamp);

    if (options.toTimestamp) {
      events = events.filter(e => e.timestamp <= options.toTimestamp!);
    }

    if (options.connectorIds?.length) {
      const ids = new Set(options.connectorIds);
      events = events.filter(e => ids.has(e.connectorId));
    }

    return events;
  }

  private toCsv(events: ConnectorEvent[], includeMetadata: boolean): string {
    const headers = [
      'id', 'connectorId', 'timestamp', 'severity', 'title', 'body',
      'category', 'eventType', 'status', 'durationMs', 'sourceUrl', 'externalId',
    ];

    if (includeMetadata) headers.push('metadata');

    const rows = events.map(e => {
      const row = [
        e.id, e.connectorId, new Date(e.timestamp).toISOString(), e.severity,
        this.csvEscape(e.title), this.csvEscape(e.body ?? ''),
        e.category ?? '', e.eventType ?? '', e.status ?? '',
        e.durationMs?.toString() ?? '', e.sourceUrl ?? '', e.externalId ?? '',
      ];

      if (includeMetadata) {
        row.push(this.csvEscape(JSON.stringify(e.metadata ?? {})));
      }

      return row.join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  private toJson(events: ConnectorEvent[], includeMetadata: boolean): string {
    const data = events.map(e => {
      const obj: Record<string, unknown> = {
        id: e.id,
        connectorId: e.connectorId,
        timestamp: new Date(e.timestamp).toISOString(),
        severity: e.severity,
        title: e.title,
        body: e.body,
        category: e.category,
        eventType: e.eventType,
        status: e.status,
        durationMs: e.durationMs,
        sourceUrl: e.sourceUrl,
        externalId: e.externalId,
      };

      if (includeMetadata) {
        obj.metadata = e.metadata;
      }

      return obj;
    });

    return JSON.stringify(data, null, 2);
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
