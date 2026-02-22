// ============================================================
// LogsPanel - Live log viewer with search
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';

interface LogLine {
  ts: number;
  level: 'log' | 'warn' | 'error';
  tag: string;
  message: string;
}

const LEVEL_COLORS: Record<string, string> = {
  log: 'text-gray-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

export function LogsPanel() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    const result = await window.iDashboard?.getLogs(search || undefined);
    if (Array.isArray(result)) setLines(result);
  }, [search]);

  // Fetch on mount + poll every 2s
  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 2000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // If user scrolled up more than 40px from bottom, disable auto-scroll
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter logs..."
          className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-indigo-500/50"
        />
        <span className="text-[10px] text-gray-600">{lines.length} lines</span>
        {!autoScroll && (
          <button
            onClick={() => setAutoScroll(true)}
            className="text-[10px] text-indigo-400 hover:text-indigo-300"
          >
            Jump to bottom
          </button>
        )}
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-1 font-mono text-[11px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="text-gray-600 text-center py-8 text-xs">
            {search ? 'No matching log lines' : 'No log lines yet'}
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="flex gap-2 py-px hover:bg-gray-800/30">
              <span className="text-gray-600 flex-shrink-0">{formatTime(line.ts)}</span>
              <span className={`flex-shrink-0 w-10 ${LEVEL_COLORS[line.level] ?? 'text-gray-400'}`}>
                {line.level.toUpperCase().padEnd(5)}
              </span>
              <span className="text-indigo-400/60 flex-shrink-0">[{line.tag}]</span>
              <span className={LEVEL_COLORS[line.level] ?? 'text-gray-400'}>{line.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
