// ============================================================
// TrendChartsPanel - SVG-based trend visualization
// Shows daily aggregates as bar charts and sparklines
// ============================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import type { AggregateResult } from '@shared/types';

const DAYS_OPTIONS = [7, 14, 30];
const EVENT_TYPES = ['info', 'warning', 'error', 'critical', 'attention'] as const;

function toDayKey(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function dayKeyToLabel(dayKey: number): string {
  const str = String(dayKey);
  return `${str.slice(4, 6)}/${str.slice(6, 8)}`;
}

function dayKeyToWeekday(dayKey: number): string {
  const str = String(dayKey);
  const d = new Date(Number(str.slice(0, 4)), Number(str.slice(4, 6)) - 1, Number(str.slice(6, 8)));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

export function TrendChartsPanel() {
  const connectors = useDashboardStore(s => s.connectors);
  const aggregates = useDashboardStore(s => s.aggregates);
  const setAggregates = useDashboardStore(s => s.setAggregates);
  const [days, setDays] = useState(7);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Multiselect filters — empty Set = all selected
  const [selectedConnectors, setSelectedConnectors] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  const allConnectorsSelected = selectedConnectors.size === 0;
  const allTypesSelected = selectedTypes.size === 0;

  const connectorList = useMemo(() => {
    const ids = new Set<string>();
    for (const c of connectors) ids.add(c.id);
    for (const a of aggregates) ids.add(a.connectorId);
    return [...ids].map(id => {
      const c = connectors.find(x => x.id === id);
      return { value: id, label: c?.displayName ?? id };
    });
  }, [connectors, aggregates]);

  const toggleConnector = useCallback((id: string) => {
    setSelectedConnectors(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (connectorList.length > 0 && next.size === connectorList.length) return new Set();
      return next;
    });
  }, [connectorList.length]);

  const toggleType = useCallback((t: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      if (next.size === EVENT_TYPES.length) return new Set();
      return next;
    });
  }, []);

  // Fetch aggregates (no connector filter — we filter client-side for multiselect)
  useEffect(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days);

    window.iDashboard?.queryAggregates({
      fromDayKey: toDayKey(from),
      toDayKey: toDayKey(now),
    }).then((result: AggregateResult[]) => {
      setAggregates(result ?? []);
    });
  }, [days, setAggregates]);

  // Client-side filter
  const filtered = useMemo(() => {
    return aggregates.filter(a => {
      if (!allConnectorsSelected && !selectedConnectors.has(a.connectorId)) return false;
      if (!allTypesSelected && !selectedTypes.has(a.eventType)) return false;
      return true;
    });
  }, [aggregates, selectedConnectors, selectedTypes, allConnectorsSelected, allTypesSelected]);

  // Group aggregates by day
  const dailyTotals = useMemo(() => {
    const map = new Map<number, { total: number; success: number; failure: number }>();

    for (const agg of filtered) {
      const existing = map.get(agg.dayKey) ?? { total: 0, success: 0, failure: 0 };
      existing.total += agg.totalCount;
      existing.success += agg.successCount;
      existing.failure += agg.failureCount;
      map.set(agg.dayKey, existing);
    }

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
  }, [filtered, days]);

  // Group by connector for breakdown
  const byConnector = useMemo(() => {
    const map = new Map<string, number>();
    for (const agg of filtered) {
      map.set(agg.connectorId, (map.get(agg.connectorId) ?? 0) + agg.totalCount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  // Group by event type for breakdown
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const agg of filtered) {
      map.set(agg.eventType, (map.get(agg.eventType) ?? 0) + agg.totalCount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const maxTotal = Math.max(1, ...dailyTotals.map(d => d.total));
  const totalEvents = dailyTotals.reduce((s, d) => s + d.total, 0);
  const totalSuccess = dailyTotals.reduce((s, d) => s + d.success, 0);
  const totalFailure = dailyTotals.reduce((s, d) => s + d.failure, 0);

  const hasFilters = !allConnectorsSelected || !allTypesSelected;

  // Y-axis ticks for bar chart
  const yTicks = useMemo(() => {
    if (maxTotal <= 1) return [0, 1];
    const step = Math.ceil(maxTotal / 4);
    const ticks: number[] = [];
    for (let v = 0; v <= maxTotal; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] < maxTotal) ticks.push(maxTotal);
    return ticks;
  }, [maxTotal]);

  // Chart dimensions
  const yAxisWidth = 30;
  const chartWidth = days * 40;
  const svgWidth = yAxisWidth + chartWidth;
  const chartHeight = 100;
  const svgHeight = chartHeight + 20; // +20 for x labels

  const chipBase = 'px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors select-none';
  const chipOn = 'bg-gray-700 text-gray-200';
  const chipOff = 'bg-transparent text-gray-500 hover:text-gray-400';

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800/50 flex-wrap flex-shrink-0">
        {/* Period */}
        <span className="text-[10px] text-gray-600 mr-0.5">Period:</span>
        {DAYS_OPTIONS.map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`${chipBase} ${days === d ? chipOn : chipOff}`}
          >
            {d}d
          </button>
        ))}

        <span className="text-gray-800 mx-1">|</span>

        {/* Connector filter */}
        <span className="text-[10px] text-gray-600 mr-0.5">Source:</span>
        <button
          className={`${chipBase} ${allConnectorsSelected ? chipOn : chipOff}`}
          onClick={() => setSelectedConnectors(new Set())}
        >All</button>
        {connectorList.map(c => (
          <button
            key={c.value}
            className={`${chipBase} ${!allConnectorsSelected && selectedConnectors.has(c.value) ? chipOn : allConnectorsSelected ? chipOn : chipOff}`}
            onClick={() => toggleConnector(c.value)}
          >{c.label}</button>
        ))}

        <span className="text-gray-800 mx-1">|</span>

        {/* Event type / severity filter */}
        <span className="text-[10px] text-gray-600 mr-0.5">Type:</span>
        <button
          className={`${chipBase} ${allTypesSelected ? chipOn : chipOff}`}
          onClick={() => setSelectedTypes(new Set())}
        >All</button>
        {EVENT_TYPES.map(t => (
          <button
            key={t}
            className={`${chipBase} ${!allTypesSelected && selectedTypes.has(t) ? chipOn : allTypesSelected ? chipOn : chipOff}`}
            onClick={() => toggleType(t)}
          >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}

        <span className="text-[10px] text-gray-600 ml-auto">
          {totalEvents} event{totalEvents !== 1 ? 's' : ''}{hasFilters ? ' (filtered)' : ''}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Total Events" value={totalEvents} color="#6366f1" />
          <SummaryCard label="Successes" value={totalSuccess} color="#22c55e" />
          <SummaryCard label="Failures" value={totalFailure} color="#ef4444" />
        </div>

        {/* Bar chart with Y-axis and value labels */}
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800/30">
          <h3 className="text-xs font-medium text-gray-400 mb-3">Daily Event Volume</h3>
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full" style={{ height: '160px' }}>
            {/* Y-axis ticks and grid lines */}
            {yTicks.map(v => {
              const y = chartHeight - (v / maxTotal) * (chartHeight - 10);
              return (
                <g key={v}>
                  <line x1={yAxisWidth} y1={y} x2={svgWidth} y2={y} stroke="#374151" strokeWidth={0.5} strokeDasharray="3,3" />
                  <text x={yAxisWidth - 4} y={y + 3} textAnchor="end" className="text-[7px] fill-gray-500">{v}</text>
                </g>
              );
            })}

            {/* Bars */}
            {dailyTotals.map((day, i) => {
              const barHeight = (day.total / maxTotal) * (chartHeight - 10);
              const successHeight = day.total > 0 ? (day.success / day.total) * barHeight : 0;
              const failureHeight = day.total > 0 ? (day.failure / day.total) * barHeight : 0;
              const otherHeight = Math.max(0, barHeight - successHeight - failureHeight);
              const x = yAxisWidth + i * 40 + 5;
              const barWidth = 30;
              const barTop = chartHeight - barHeight;
              const isHovered = hoveredBar === i;

              return (
                <g
                  key={day.dayKey}
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{ cursor: 'default' }}
                >
                  {/* Hover background */}
                  {isHovered && (
                    <rect x={x - 2} y={0} width={barWidth + 4} height={chartHeight} fill="#ffffff" opacity={0.03} rx={3} />
                  )}

                  {/* Success */}
                  <rect x={x} y={barTop} width={barWidth} height={successHeight} fill="#22c55e" opacity={isHovered ? 1 : 0.8} rx={2} />
                  {/* Failure */}
                  <rect x={x} y={barTop + successHeight} width={barWidth} height={failureHeight} fill="#ef4444" opacity={isHovered ? 1 : 0.8} rx={2} />
                  {/* Other */}
                  <rect x={x} y={barTop + successHeight + failureHeight} width={barWidth} height={otherHeight} fill="#6366f1" opacity={isHovered ? 0.8 : 0.6} rx={2} />

                  {/* Value on top of bar */}
                  {day.total > 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={barTop - 3}
                      textAnchor="middle"
                      className={`text-[8px] ${isHovered ? 'fill-gray-200' : 'fill-gray-400'}`}
                      fontWeight={isHovered ? 600 : 400}
                    >
                      {day.total}
                    </text>
                  )}

                  {/* X-axis label */}
                  <text x={x + barWidth / 2} y={chartHeight + 12} textAnchor="middle" className="text-[7px] fill-gray-500">
                    {dayKeyToLabel(day.dayKey)}
                  </text>
                  {days <= 14 && (
                    <text x={x + barWidth / 2} y={chartHeight + 19} textAnchor="middle" className="text-[6px] fill-gray-600">
                      {dayKeyToWeekday(day.dayKey)}
                    </text>
                  )}

                  {/* Tooltip on hover */}
                  {isHovered && day.total > 0 && (
                    <g>
                      <rect x={x - 10} y={Math.max(0, barTop - 38)} width={50} height={30} rx={4} fill="#1f2937" stroke="#374151" strokeWidth={0.5} />
                      <text x={x + 15} y={Math.max(13, barTop - 25)} textAnchor="middle" className="text-[7px] fill-gray-300">
                        {day.success > 0 ? `✓${day.success}` : ''}{day.failure > 0 ? ` ✕${day.failure}` : ''}{(day.total - day.success - day.failure) > 0 ? ` ●${day.total - day.success - day.failure}` : ''}
                      </text>
                      <text x={x + 15} y={Math.max(22, barTop - 14)} textAnchor="middle" className="text-[8px] fill-gray-100" fontWeight={600}>
                        Total: {day.total}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-2 h-2 rounded-sm bg-green-500 inline-block" /> Success
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> Failure
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" /> Other
            </span>
          </div>
        </div>

        {/* Sparkline with values */}
        {dailyTotals.length > 1 && (
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800/30">
            <h3 className="text-xs font-medium text-gray-400 mb-3">Trend Line</h3>
            <svg viewBox="0 0 340 80" className="w-full" style={{ height: '100px' }}>
              {/* Y-axis labels */}
              <text x="18" y="15" textAnchor="end" className="text-[7px] fill-gray-500">{maxTotal}</text>
              <text x="18" y="67" textAnchor="end" className="text-[7px] fill-gray-500">0</text>

              {/* Horizontal grid */}
              <line x1="22" y1="12" x2="335" y2="12" stroke="#374151" strokeWidth={0.3} />
              <line x1="22" y1="38" x2="335" y2="38" stroke="#374151" strokeWidth={0.3} strokeDasharray="3,3" />
              <line x1="22" y1="64" x2="335" y2="64" stroke="#374151" strokeWidth={0.3} />

              {/* Filled area */}
              <polygon
                fill="#6366f1"
                opacity={0.1}
                points={[
                  ...dailyTotals.map((d, i) => {
                    const x = (i / (dailyTotals.length - 1)) * 310 + 25;
                    const y = 64 - (d.total / maxTotal) * 52;
                    return `${x},${y}`;
                  }),
                  `${310 + 25},64`,
                  `25,64`,
                ].join(' ')}
              />

              {/* Line */}
              <polyline
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                points={dailyTotals.map((d, i) => {
                  const x = (i / (dailyTotals.length - 1)) * 310 + 25;
                  const y = 64 - (d.total / maxTotal) * 52;
                  return `${x},${y}`;
                }).join(' ')}
              />

              {/* Data points with values */}
              {dailyTotals.map((d, i) => {
                const x = (i / (dailyTotals.length - 1)) * 310 + 25;
                const y = 64 - (d.total / maxTotal) * 52;
                const isHovered = hoveredPoint === i;
                const showValue = days <= 14 || isHovered || i === 0 || i === dailyTotals.length - 1;

                return (
                  <g
                    key={i}
                    onMouseEnter={() => setHoveredPoint(i)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    {/* Larger invisible hit area */}
                    <circle cx={x} cy={y} r={10} fill="transparent" />
                    {/* Visible dot */}
                    <circle cx={x} cy={y} r={isHovered ? 4 : 2.5} fill={isHovered ? '#818cf8' : '#6366f1'} />
                    {/* Value label */}
                    {showValue && d.total > 0 && (
                      <text
                        x={x}
                        y={y - 7}
                        textAnchor="middle"
                        className={`text-[8px] ${isHovered ? 'fill-gray-200' : 'fill-gray-400'}`}
                        fontWeight={isHovered ? 600 : 400}
                      >
                        {d.total}
                      </text>
                    )}
                    {/* Hover: date label */}
                    {isHovered && (
                      <text x={x} y="76" textAnchor="middle" className="text-[7px] fill-gray-400">
                        {dayKeyToLabel(d.dayKey)} {dayKeyToWeekday(d.dayKey)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Breakdowns side by side */}
        <div className="grid grid-cols-2 gap-3">
          {/* Connector breakdown */}
          {byConnector.length > 0 && (
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800/30">
              <h3 className="text-xs font-medium text-gray-400 mb-3">By Connector</h3>
              <div className="space-y-2">
                {byConnector.map(([id, count]) => {
                  const connector = connectors.find(c => c.id === id);
                  const pct = totalEvents > 0 ? (count / totalEvents) * 100 : 0;

                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-300 truncate w-20">
                        {connector?.displayName ?? id}
                      </span>
                      <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 w-14 text-right font-mono">{count} ({Math.round(pct)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Event type breakdown */}
          {byType.length > 0 && (
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800/30">
              <h3 className="text-xs font-medium text-gray-400 mb-3">By Type</h3>
              <div className="space-y-2">
                {byType.map(([type, count]) => {
                  const pct = totalEvents > 0 ? (count / totalEvents) * 100 : 0;
                  const color = typeColor(type);

                  return (
                    <div key={type} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-300 truncate w-20 capitalize">
                        {type}
                      </span>
                      <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 w-14 text-right font-mono">{count} ({Math.round(pct)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Empty state */}
        {totalEvents === 0 && (
          <div className="flex items-center justify-center py-12 text-gray-600 text-sm">
            <div className="text-center">
              <div className="text-2xl mb-2">○</div>
              <div>{hasFilters ? 'No data matches filters' : 'No event data for this period'}</div>
              <div className="text-xs text-gray-700 mt-1">
                {hasFilters ? 'Try adjusting your filters' : 'Events will appear here as they are collected'}
              </div>
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

function typeColor(type: string): string {
  switch (type) {
    case 'info': return '#6366f1';
    case 'warning': return '#f59e0b';
    case 'error': return '#ef4444';
    case 'critical': return '#dc2626';
    case 'attention': return '#f97316';
    default: return '#6b7280';
  }
}
