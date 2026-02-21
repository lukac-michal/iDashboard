// ============================================================
// TrendChartsPanel - SVG-based trend visualization
// Shows daily aggregates as bar charts and sparklines
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import type { AggregateResult } from '@shared/types';

const DAYS_OPTIONS = [7, 14, 30];

function toDayKey(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function dayKeyToLabel(dayKey: number): string {
  const str = String(dayKey);
  return `${str.slice(4, 6)}/${str.slice(6, 8)}`;
}

export function TrendChartsPanel() {
  const connectors = useDashboardStore(s => s.connectors);
  const aggregates = useDashboardStore(s => s.aggregates);
  const setAggregates = useDashboardStore(s => s.setAggregates);
  const [days, setDays] = useState(7);
  const [selectedConnector, setSelectedConnector] = useState<string>('');

  useEffect(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days);

    window.iDashboard?.queryAggregates({
      connectorId: selectedConnector || undefined,
      fromDayKey: toDayKey(from),
      toDayKey: toDayKey(now),
    }).then((result: AggregateResult[]) => {
      setAggregates(result ?? []);
    });
  }, [days, selectedConnector, setAggregates]);

  // Group aggregates by day
  const dailyTotals = useMemo(() => {
    const map = new Map<number, { total: number; success: number; failure: number }>();

    for (const agg of aggregates) {
      const existing = map.get(agg.dayKey) ?? { total: 0, success: 0, failure: 0 };
      existing.total += agg.totalCount;
      existing.success += agg.successCount;
      existing.failure += agg.failureCount;
      map.set(agg.dayKey, existing);
    }

    // Fill in missing days
    const now = new Date();
    const result: { dayKey: number; total: number; success: number; failure: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dk = toDayKey(d);
      const data = map.get(dk) ?? { total: 0, success: 0, failure: 0 };
      result.push({ dayKey: dk, ...data });
    }

    return result;
  }, [aggregates, days]);

  // Group by connector for breakdown
  const byConnector = useMemo(() => {
    const map = new Map<string, number>();
    for (const agg of aggregates) {
      map.set(agg.connectorId, (map.get(agg.connectorId) ?? 0) + agg.totalCount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [aggregates]);

  const maxTotal = Math.max(1, ...dailyTotals.map(d => d.total));
  const totalEvents = dailyTotals.reduce((s, d) => s + d.total, 0);
  const totalSuccess = dailyTotals.reduce((s, d) => s + d.success, 0);
  const totalFailure = dailyTotals.reduce((s, d) => s + d.failure, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800/50">
        <span className="text-xs text-gray-400">Period:</span>
        {DAYS_OPTIONS.map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-2 py-0.5 text-xs rounded ${
              days === d ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {d}d
          </button>
        ))}

        <select
          value={selectedConnector}
          onChange={e => setSelectedConnector(e.target.value)}
          className="ml-auto bg-gray-800/60 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 outline-none"
        >
          <option value="">All connectors</option>
          {connectors.map(c => (
            <option key={c.id} value={c.id}>{c.displayName}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Total Events" value={totalEvents} color="#6366f1" />
          <SummaryCard label="Successes" value={totalSuccess} color="#22c55e" />
          <SummaryCard label="Failures" value={totalFailure} color="#ef4444" />
        </div>

        {/* Bar chart */}
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800/30">
          <h3 className="text-xs font-medium text-gray-400 mb-3">Daily Event Volume</h3>
          <svg viewBox={`0 0 ${days * 40} 120`} className="w-full h-32">
            {dailyTotals.map((day, i) => {
              const barHeight = (day.total / maxTotal) * 100;
              const successHeight = day.total > 0 ? (day.success / day.total) * barHeight : 0;
              const failureHeight = day.total > 0 ? (day.failure / day.total) * barHeight : 0;
              const x = i * 40 + 5;
              const barWidth = 30;

              return (
                <g key={day.dayKey}>
                  {/* Success portion */}
                  <rect
                    x={x} y={110 - barHeight}
                    width={barWidth} height={successHeight}
                    fill="#22c55e" opacity={0.8} rx={2}
                  />
                  {/* Failure portion */}
                  <rect
                    x={x} y={110 - barHeight + successHeight}
                    width={barWidth} height={failureHeight}
                    fill="#ef4444" opacity={0.8} rx={2}
                  />
                  {/* Other */}
                  <rect
                    x={x} y={110 - barHeight + successHeight + failureHeight}
                    width={barWidth} height={Math.max(0, barHeight - successHeight - failureHeight)}
                    fill="#6366f1" opacity={0.6} rx={2}
                  />
                  {/* Label */}
                  <text x={x + barWidth / 2} y={120} textAnchor="middle" className="text-[8px] fill-gray-500">
                    {dayKeyToLabel(day.dayKey)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Sparkline */}
        {dailyTotals.length > 1 && (
          <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800/30">
            <h3 className="text-xs font-medium text-gray-400 mb-3">Trend Line</h3>
            <svg viewBox="0 0 300 60" className="w-full h-16">
              <polyline
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                points={dailyTotals.map((d, i) => {
                  const x = (i / (dailyTotals.length - 1)) * 290 + 5;
                  const y = 55 - (d.total / maxTotal) * 50;
                  return `${x},${y}`;
                }).join(' ')}
              />
              {dailyTotals.map((d, i) => {
                const x = (i / (dailyTotals.length - 1)) * 290 + 5;
                const y = 55 - (d.total / maxTotal) * 50;
                return (
                  <circle key={i} cx={x} cy={y} r={2.5} fill="#6366f1" />
                );
              })}
            </svg>
          </div>
        )}

        {/* Connector breakdown */}
        {byConnector.length > 0 && (
          <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800/30">
            <h3 className="text-xs font-medium text-gray-400 mb-2">By Connector</h3>
            <div className="space-y-1.5">
              {byConnector.map(([id, count]) => {
                const connector = connectors.find(c => c.id === id);
                const pct = totalEvents > 0 ? (count / totalEvents) * 100 : 0;

                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 truncate w-24">
                      {connector?.displayName ?? id}
                    </span>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 w-12 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800/30">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold mt-0.5" style={{ color }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
