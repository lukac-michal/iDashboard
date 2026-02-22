// ============================================================
// SeverityBadge - Event severity indicator
// ============================================================

import type { EventSeverity } from '@shared/types';

interface SeverityBadgeProps {
  severity: EventSeverity;
  compact?: boolean;
}

const SEVERITY_STYLES: Record<EventSeverity, { bg: string; text: string; label: string; color: string }> = {
  info: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Info', color: '#60a5fa' },
  warning: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Warning', color: '#fbbf24' },
  error: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Error', color: '#f87171' },
  critical: { bg: 'bg-red-600/30', text: 'text-red-300', label: 'Critical', color: '#fca5a5' },
  attention: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Attention', color: '#fb923c' },
};

export function SeverityBadge({ severity, compact }: SeverityBadgeProps) {
  const style = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info;

  if (compact) {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: style.color }}
        title={style.label}
      />
    );
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}
