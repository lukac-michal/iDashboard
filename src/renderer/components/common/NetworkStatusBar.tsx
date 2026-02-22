// ============================================================
// NetworkStatusBar - Global online/offline/degraded/VPN banner
// ============================================================

import { useDashboardStore } from '@renderer/store/dashboard';

export function NetworkStatusBar() {
  const networkState = useDashboardStore(s => s.networkState);

  if (networkState === 'online') return null;

  const config = {
    offline: {
      bg: 'bg-red-900/80',
      text: 'Network disconnected — polling paused',
      icon: '⊘',
    },
    degraded: {
      bg: 'bg-amber-900/80',
      text: 'Some services unreachable',
      icon: '⚠',
    },
    'vpn-disconnected': {
      bg: 'bg-orange-900/80',
      text: 'VPN required for some connectors',
      icon: '🔒',
    },
  }[networkState];

  if (!config) return null;

  return (
    <div className={`${config.bg} px-4 py-2 text-xs flex items-center gap-2 animate-fade-in`}>
      <span>{config.icon}</span>
      <span>{config.text}</span>
    </div>
  );
}
