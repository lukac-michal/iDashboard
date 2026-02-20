// ============================================================
// Dashboard Store - Central state management
// ============================================================

import { create } from 'zustand';
import type { ConnectorEvent, ConnectorStatus, AppConfig, ReachabilityState } from '@shared/types';

interface DashboardState {
  // Events
  events: Map<string, ConnectorEvent>;
  activeEvents: ConnectorEvent[];

  // Connectors
  connectors: ConnectorStatus[];

  // UI
  windowWidth: number;
  windowHeight: number;

  // Network
  networkState: ReachabilityState;
  isOnline: boolean;
  vpnDetected: boolean;

  // Config
  config: AppConfig | null;

  // Actions
  pushEvent: (event: ConnectorEvent) => void;
  dismissEvent: (eventId: string) => void;
  setEvents: (events: ConnectorEvent[]) => void;
  setConnectors: (connectors: ConnectorStatus[]) => void;
  setWindowSize: (width: number, height: number) => void;
  setNetworkState: (state: ReachabilityState) => void;
  setOnlineStatus: (online: boolean, vpn: boolean) => void;
  setConfig: (config: AppConfig) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  events: new Map(),
  activeEvents: [],
  connectors: [],
  windowWidth: window.innerWidth,
  windowHeight: window.innerHeight,
  networkState: 'online',
  isOnline: true,
  vpnDetected: false,
  config: null,

  pushEvent: (event) => {
    set((state) => {
      const events = new Map(state.events);
      events.set(event.id, event);

      // Keep max 1000 events in memory
      if (events.size > 1000) {
        const oldest = [...events.keys()].slice(0, events.size - 1000);
        for (const key of oldest) events.delete(key);
      }

      const activeEvents = [...events.values()]
        .filter(e => !e.dismissed)
        .sort((a, b) => b.timestamp - a.timestamp);

      return { events, activeEvents };
    });
  },

  dismissEvent: (eventId) => {
    const event = get().events.get(eventId);
    if (event) {
      event.dismissed = true;
      window.iDashboard?.dismissEvent(eventId);
    }

    set((state) => {
      const activeEvents = state.activeEvents.filter(e => e.id !== eventId);
      return { activeEvents };
    });
  },

  setEvents: (events) => {
    const map = new Map<string, ConnectorEvent>();
    for (const event of events) {
      map.set(event.id, event);
    }
    const activeEvents = events
      .filter(e => !e.dismissed)
      .sort((a, b) => b.timestamp - a.timestamp);

    set({ events: map, activeEvents });
  },

  setConnectors: (connectors) => set({ connectors }),

  setWindowSize: (width, height) => set({ windowWidth: width, windowHeight: height }),

  setNetworkState: (networkState) => set({ networkState }),

  setOnlineStatus: (isOnline, vpnDetected) => set({ isOnline, vpnDetected }),

  setConfig: (config) => set({ config }),
}));
