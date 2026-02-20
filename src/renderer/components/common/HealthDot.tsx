// ============================================================
// HealthDot - Per-connector health indicator
// ============================================================

import type { ConnectorHealth } from '@shared/types';

interface HealthDotProps {
  health?: ConnectorHealth;
  size?: 'sm' | 'md';
}

export function HealthDot({ health, size = 'sm' }: HealthDotProps) {
  if (!health) return null;

  const sizeClass = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  let colorClass: string;
  let title: string;

  switch (health.reachability) {
    case 'reachable':
      colorClass = 'bg-green-500';
      title = health.latencyMs ? `Last poll: ${health.latencyMs}ms` : 'Healthy';
      break;
    case 'auth-failed':
      colorClass = 'bg-red-500';
      title = 'Authentication failed — check credentials';
      break;
    case 'dns-failed':
    case 'tcp-failed':
    case 'http-failed':
      if (health.circuitState === 'open') {
        colorClass = 'bg-red-500';
        title = `Unreachable — retrying in ${Math.round(health.currentBackoffMs / 1000)}s`;
      } else {
        colorClass = 'bg-yellow-500';
        title = `Retrying (${health.consecutiveFailures} failures)`;
      }
      break;
    default:
      if (health.requiresVpn) {
        colorClass = 'bg-orange-500';
        title = 'VPN required';
      } else {
        colorClass = 'bg-gray-500';
        title = 'Unknown status';
      }
  }

  return (
    <span
      className={`inline-block ${sizeClass} rounded-full ${colorClass} flex-shrink-0`}
      title={title}
    />
  );
}
