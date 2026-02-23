// ============================================================
// useIPCSync - Synchronize main process state with Zustand store
// ============================================================

import { useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import type { ConnectorEvent, ConnectorStatus, AppConfig, AgentInfo, AgentMessage, SlackChatMessage } from '@shared/types';

const SLACK_EVENT_TYPES = new Set(['dm-received', 'message-received', 'mention-received']);

/** Convert a ConnectorEvent from the Slack connector into a SlackChatMessage for the chat store. */
export function connectorEventToSlackMessage(evt: ConnectorEvent): SlackChatMessage | null {
  if (!evt.eventType || !SLACK_EVENT_TYPES.has(evt.eventType)) return null;
  return {
    id: `recv-${evt.id}`,
    channel: (evt.metadata?.channel as string) || evt.category || 'unknown',
    text: evt.body || evt.title,
    timestamp: evt.timestamp,
    direction: 'received',
    user: (evt.metadata?.user as string) || evt.title.split(':')[0] || undefined,
    threadTs: (evt.metadata?.threadTs as string) || undefined,
    slackTs: (evt.metadata?.ts as string) || undefined,
    eventType: evt.eventType,
  };
}

export function useIPCSync() {
  const { pushEvent, setEvents, setConnectors, setConfig, setOnlineStatus, setNetworkState, setActivePanel, setAgents, addAgentMessage, setSlackChannels, addSlackMessage } =
    useDashboardStore();

  useEffect(() => {
    const api = window.iDashboard;
    if (!api) return;

    // Initial data load
    api.getEvents().then((events: ConnectorEvent[]) => {
      setEvents(events);
      // Backfill existing Slack events into conversation store
      for (const evt of events) {
        const msg = connectorEventToSlackMessage(evt);
        if (msg) addSlackMessage(msg);
      }
    });
    api.getConnectors().then((connectors: ConnectorStatus[]) => setConnectors(connectors));
    api.getConfig().then((config: AppConfig) => setConfig(config));
    api.getNetworkStatus().then((status: { isOnline: boolean; vpnDetected: boolean; overallState: string }) => {
      setOnlineStatus(status.isOnline, status.vpnDetected);
      setNetworkState(status.overallState as Parameters<typeof setNetworkState>[0]);
    });

    // Subscribe to real-time events from main process
    const unsubEvent = api.onEvent((event: unknown) => {
      const evt = event as ConnectorEvent;
      pushEvent(evt);
      const msg = connectorEventToSlackMessage(evt);
      if (msg) addSlackMessage(msg);
    });

    const unsubConfig = api.onConfigChanged((config: unknown) => {
      setConfig(config as AppConfig);
    });

    const unsubNetwork = api.onNetworkChanged((status: unknown) => {
      const s = status as { state: string };
      setNetworkState(s.state as Parameters<typeof setNetworkState>[0]);
    });

    const unsubNavigate = api.onNavigate((panel: unknown) => {
      setActivePanel(panel as Parameters<typeof setActivePanel>[0]);
    });

    const unsubAgents = api.onAgentsChanged?.((agents: unknown) => {
      setAgents(agents as AgentInfo[]);
    }) ?? (() => {});

    const unsubAgentMsg = api.onAgentMessage?.((message: unknown) => {
      addAgentMessage(message as AgentMessage);
    }) ?? (() => {});

    // Initial agent data load
    api.getAgents?.().then((agents: AgentInfo[]) => setAgents(agents ?? []));

    // Load Slack channels
    api.slackGetChannels?.().then((channels: string[]) => setSlackChannels(channels ?? []));

    // Poll connectors status periodically
    const statusInterval = setInterval(() => {
      api.getConnectors().then((connectors: ConnectorStatus[]) => setConnectors(connectors));
    }, 5000);

    return () => {
      unsubEvent();
      unsubConfig();
      unsubNetwork();
      unsubNavigate();
      unsubAgents();
      unsubAgentMsg();
      clearInterval(statusInterval);
    };
  }, [pushEvent, setEvents, setConnectors, setConfig, setOnlineStatus, setNetworkState, setActivePanel, setAgents, addAgentMessage, setSlackChannels, addSlackMessage]);
}
