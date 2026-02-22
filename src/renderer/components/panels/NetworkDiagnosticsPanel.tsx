// ============================================================
// NetworkDiagnosticsPanel - Per-connector health details
// ============================================================

import { useState, useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import { HealthDot } from '@renderer/components/common/HealthDot';
import type { ConnectorStatus, ConnectorHealth } from '@shared/types';

export function NetworkDiagnosticsPanel() {
  const networkState = useDashboardStore(s => s.networkState);
  const isOnline = useDashboardStore(s => s.isOnline);
  const vpnDetected = useDashboardStore(s => s.vpnDetected);
  const [detailedHealth, setDetailedHealth] = useState<ConnectorStatus[]>([]);

  useEffect(() => {
    const load = () => {
      window.iDashboard?.getConnectorHealth().then((data: ConnectorStatus[]) => {
        setDetailedHealth(data ?? []);
      });
    };

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const overallBg = {
    online: 'bg-green-900/20 border-green-800/30',
    degraded: 'bg-amber-900/20 border-amber-800/30',
    'vpn-disconnected': 'bg-orange-900/20 border-orange-800/30',
    offline: 'bg-red-900/20 border-red-800/30',
  }[networkState] ?? 'bg-gray-900/20 border-gray-800/30';

  return (
    <div className="flex flex-col h-full">
      {/* Overall Status */}
      <div className={`mx-4 mt-4 p-4 rounded-lg border ${overallBg}`}>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            networkState === 'online' ? 'bg-green-400' :
            networkState === 'degraded' ? 'bg-amber-400' :
            networkState === 'offline' ? 'bg-red-400' : 'bg-orange-400'
          }`} />
          <span className="text-sm font-medium text-gray-200 capitalize">{networkState}</span>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-400">
          <span>Internet: {isOnline ? 'Connected' : 'Disconnected'}</span>
          <span>VPN: {vpnDetected ? 'Detected' : 'Not detected'}</span>
        </div>
      </div>

      {/* Connector Health List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {detailedHealth.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No connectors configured
          </div>
        ) : (
          detailedHealth.map(connector => (
            <ConnectorHealthCard key={connector.id} connector={connector} />
          ))
        )}
      </div>
    </div>
  );
}

function ConnectorHealthCard({ connector }: { connector: ConnectorStatus }) {
  const [expanded, setExpanded] = useState(false);
  const health = connector.health;

  const stateColor = health?.circuitState === 'closed' ? 'text-green-400' :
    health?.circuitState === 'open' ? 'text-red-400' : 'text-amber-400';

  return (
    <div
      className="bg-gray-900/50 rounded-lg border border-gray-800/30 p-3 cursor-pointer hover:bg-gray-800/30 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2">
        <HealthDot health={health} />
        <span className="text-sm font-medium text-gray-200 flex-1 truncate">
          {connector.displayName}
        </span>
        <span className="text-[10px] text-gray-500">{connector.type}</span>
        <span className={`text-[10px] font-medium ${stateColor}`}>
          {health?.circuitState ?? 'unknown'}
        </span>
      </div>

      <div className="flex gap-3 mt-1.5 text-[10px] text-gray-500">
        <span>
          Reachability: {health?.reachability ?? 'unknown'}
        </span>
        {health?.latencyMs != null && (
          <span>Latency: {health.latencyMs}ms</span>
        )}
        <span className={connector.connected ? 'text-green-500' : 'text-gray-600'}>
          {connector.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {expanded && health && (
        <HealthDetails health={health} lastError={connector.lastError} />
      )}
    </div>
  );
}

function HealthDetails({ health, lastError }: { health: ConnectorHealth; lastError?: string }) {
  return (
    <div className="mt-3 pt-2 border-t border-gray-800/30 space-y-2 animate-fade-in">
      <DetailRow label="Circuit State" value={health.circuitState} />
      <DetailRow label="Consecutive Failures" value={String(health.consecutiveFailures)} />
      <DetailRow label="Current Backoff" value={`${health.currentBackoffMs}ms`} />
      <DetailRow label="Requires VPN" value={health.requiresVpn ? 'Yes' : 'No'} />
      {health.lastSuccessAt && (
        <DetailRow label="Last Success" value={new Date(health.lastSuccessAt).toLocaleString()} />
      )}
      {health.lastFailureAt && (
        <DetailRow label="Last Failure" value={new Date(health.lastFailureAt).toLocaleString()} />
      )}
      {health.nextPollAt && (
        <DetailRow label="Next Poll" value={new Date(health.nextPollAt).toLocaleString()} />
      )}
      {(health.lastError || lastError) && (
        <div className="mt-1">
          <span className="text-[10px] text-gray-600">Last Error:</span>
          <p className="text-[10px] text-red-400 mt-0.5 bg-red-900/10 rounded p-2.5 break-all">
            {health.lastError || lastError}
          </p>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}
