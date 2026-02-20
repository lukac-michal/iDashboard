// ============================================================
// useIPCSync - Synchronize main process state with Zustand store
// ============================================================

import { useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import type { ConnectorEvent, ConnectorStatus, AppConfig } from '@shared/types';

export function useIPCSync() {
  const { pushEvent, setEvents, setConnectors, setConfig, setOnlineStatus, setNetworkState } =
    useDashboardStore();

  useEffect(() => {
    const api = window.iDashboard;
    if (!api) return;

    // Initial data load
    api.getEvents().then((events: ConnectorEvent[]) => setEvents(events));
    api.getConnectors().then((connectors: ConnectorStatus[]) => setConnectors(connectors));
    api.getConfig().then((config: AppConfig) => setConfig(config));
    api.getNetworkStatus().then((status: { isOnline: boolean; vpnDetected: boolean; overallState: string }) => {
      setOnlineStatus(status.isOnline, status.vpnDetected);
      setNetworkState(status.overallState as Parameters<typeof setNetworkState>[0]);
    });

    // Subscribe to real-time events from main process
    const unsubEvent = api.onEvent((event: unknown) => {
      pushEvent(event as ConnectorEvent);
    });

    const unsubConfig = api.onConfigChanged((config: unknown) => {
      setConfig(config as AppConfig);
    });

    const unsubNetwork = api.onNetworkChanged((status: unknown) => {
      const s = status as { state: string };
      setNetworkState(s.state as Parameters<typeof setNetworkState>[0]);
    });

    // Poll connectors status periodically
    const statusInterval = setInterval(() => {
      api.getConnectors().then((connectors: ConnectorStatus[]) => setConnectors(connectors));
    }, 5000);

    return () => {
      unsubEvent();
      unsubConfig();
      unsubNetwork();
      clearInterval(statusInterval);
    };
  }, [pushEvent, setEvents, setConnectors, setConfig, setOnlineStatus, setNetworkState]);
}
