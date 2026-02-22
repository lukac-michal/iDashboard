// ============================================================
// Dashboard Store - Central state management
// ============================================================

import { create } from 'zustand';
import type {
  ConnectorEvent,
  ConnectorStatus,
  AppConfig,
  ReachabilityState,
  GridLayoutItem,
  SettingsTab,
  AggregateResult,
  CrossConnectorRule,
  ThemeColors,
} from '@shared/types';

export type ViewPanel = 'dashboard' | 'history' | 'trends' | 'diagnostics' | 'settings' | 'logs';

interface DashboardState {
  // Events
  events: Map<string, ConnectorEvent>;
  activeEvents: ConnectorEvent[];

  // History
  historyEvents: ConnectorEvent[];
  historyFilter: {
    connectorId?: string;
    severity?: string;
    search?: string;
  };

  // Connectors
  connectors: ConnectorStatus[];

  // UI
  uiStyle: 'normal' | 'minimal';
  windowWidth: number;
  windowHeight: number;
  activePanel: ViewPanel;
  settingsTab: SettingsTab;

  // Grid layout
  gridLayout: GridLayoutItem[];
  gridEditMode: boolean;

  // Network
  networkState: ReachabilityState;
  isOnline: boolean;
  vpnDetected: boolean;

  // Config
  config: AppConfig | null;

  // Theme
  themeColors: ThemeColors | null;
  currentThemeName: string;

  // Trends
  aggregates: AggregateResult[];

  // Rules
  rules: CrossConnectorRule[];

  // Global event counter (monotonically increasing)
  eventCounter: number;

  // Actions
  pushEvent: (event: ConnectorEvent) => void;
  dismissEvent: (eventId: string) => void;
  setEvents: (events: ConnectorEvent[]) => void;
  setConnectors: (connectors: ConnectorStatus[]) => void;
  setWindowSize: (width: number, height: number) => void;
  setNetworkState: (state: ReachabilityState) => void;
  setOnlineStatus: (online: boolean, vpn: boolean) => void;
  setConfig: (config: AppConfig) => void;
  setUiStyle: (style: 'normal' | 'minimal') => void;
  setActivePanel: (panel: ViewPanel) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setGridLayout: (layout: GridLayoutItem[]) => void;
  setGridEditMode: (editMode: boolean) => void;
  setHistoryEvents: (events: ConnectorEvent[]) => void;
  setHistoryFilter: (filter: DashboardState['historyFilter']) => void;
  setThemeColors: (colors: ThemeColors | null, name: string) => void;
  setAggregates: (aggregates: AggregateResult[]) => void;
  setRules: (rules: CrossConnectorRule[]) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  events: new Map(),
  activeEvents: [],
  historyEvents: [],
  historyFilter: {},
  connectors: [],
  uiStyle: 'normal',
  windowWidth: window.innerWidth,
  windowHeight: window.innerHeight,
  activePanel: 'dashboard',
  settingsTab: 'general',
  gridLayout: [],
  gridEditMode: false,
  networkState: 'online',
  isOnline: true,
  vpnDetected: false,
  config: null,
  themeColors: null,
  currentThemeName: 'dark',
  aggregates: [],
  rules: [],
  eventCounter: 0,

  pushEvent: (event) => {
    set((state) => {
      const nextCounter = state.eventCounter + 1;
      const taggedEvent = { ...event, _seq: nextCounter } as ConnectorEvent & { _seq: number };
      const events = new Map(state.events);
      events.set(event.id, taggedEvent);

      if (events.size > 1000) {
        const oldest = [...events.keys()].slice(0, events.size - 1000);
        for (const key of oldest) events.delete(key);
      }

      const activeEvents = [...events.values()]
        .filter(e => !e.dismissed)
        .sort((a, b) => b.timestamp - a.timestamp);

      return { events, activeEvents, eventCounter: nextCounter };
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
    // Sort oldest-first so _seq numbers are chronological
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    let counter = 0;
    for (const event of sorted) {
      counter++;
      map.set(event.id, { ...event, _seq: counter } as ConnectorEvent & { _seq: number });
    }
    const activeEvents = [...map.values()]
      .filter(e => !e.dismissed)
      .sort((a, b) => b.timestamp - a.timestamp);

    set({ events: map, activeEvents, eventCounter: counter });
  },

  setConnectors: (connectors) => set({ connectors }),
  setWindowSize: (width, height) => set({ windowWidth: width, windowHeight: height }),
  setNetworkState: (networkState) => set({ networkState }),
  setOnlineStatus: (isOnline, vpnDetected) => set({ isOnline, vpnDetected }),
  setConfig: (config) => {
    // Sync uiStyle from config only on initial load (when store has no config yet)
    const current = get().config;
    if (!current && config.window?.uiStyle) {
      set({ config, uiStyle: config.window.uiStyle });
    } else {
      set({ config });
    }
  },
  setUiStyle: (uiStyle) => set({ uiStyle }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setGridLayout: (gridLayout) => set({ gridLayout }),
  setGridEditMode: (gridEditMode) => set({ gridEditMode }),
  setHistoryEvents: (historyEvents) => set({ historyEvents }),
  setHistoryFilter: (historyFilter) => set({ historyFilter }),
  setThemeColors: (themeColors, currentThemeName) => set({ themeColors, currentThemeName }),
  setAggregates: (aggregates) => set({ aggregates }),
  setRules: (rules) => set({ rules }),
}));
