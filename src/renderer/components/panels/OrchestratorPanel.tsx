// ============================================================
// OrchestratorPanel - Multi-agent orchestration hub
// ============================================================

import { useState, useEffect } from 'react';
import { useDashboardStore } from '@renderer/store/dashboard';
import { Modal } from '@renderer/components/common/Modal';
import type { AgentInfo, AgentMessage, AgentTask, AgentStatus, AgentReportStatus, ProfileOption } from '@shared/types';

const STATUS_COLORS: Record<AgentStatus, string> = {
  online: 'bg-green-400',
  busy: 'bg-yellow-400',
  idle: 'bg-blue-400',
  offline: 'bg-gray-500',
  stale: 'bg-red-400',
};

const REPORT_STATUS_COLORS: Record<AgentReportStatus, string> = {
  working: 'bg-green-500 text-white',
  done: 'bg-green-700 text-white',
  question: 'bg-yellow-500 text-black',
  blocked: 'bg-red-500 text-white',
  error: 'bg-red-600 text-white',
};

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function AgentCard({ agent, onTerminate, confirmingTerminate }: { agent: AgentInfo; onTerminate: (id: string) => void; confirmingTerminate: boolean }) {
  const handleFocus = () => {
    window.iDashboard?.focusAgent(agent.id);
  };

  const handleTerminate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTerminate(agent.id);
  };

  return (
    <button
      onClick={handleFocus}
      className={`flex-shrink-0 w-36 bg-gray-900/60 border rounded-lg p-3 hover:bg-gray-800/40 transition-colors text-left relative group ${confirmingTerminate ? 'border-red-500/70' : 'border-gray-800/50'}`}
    >
      {/* Terminate button - top right, visible on hover */}
      {agent.status !== 'offline' && (
        <span
          onClick={handleTerminate}
          className={`absolute top-1 right-1 w-4 h-4 flex items-center justify-center text-xs cursor-pointer transition-opacity ${confirmingTerminate ? 'text-red-400 opacity-100' : 'text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100'}`}
          title={confirmingTerminate ? 'Click again to confirm' : 'Terminate agent'}
        >
          x
        </span>
      )}
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status]}`} />
        <span className="text-xs font-medium text-gray-200 truncate">{agent.name}</span>
      </div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] text-gray-500">{agent.status}</span>
        {agent.reportStatus && (
          <span className={`text-[9px] px-1 py-px rounded ${REPORT_STATUS_COLORS[agent.reportStatus]}`}>
            {agent.reportStatus}
          </span>
        )}
      </div>
      {agent.shortSummary && (
        <div className="text-[10px] text-gray-400 truncate mb-0.5" title={agent.shortSummary}>
          {agent.shortSummary}
        </div>
      )}
      <div className="text-[10px] text-gray-600">{timeAgo(agent.lastReportAt ?? agent.lastSeenAt)}</div>
    </button>
  );
}

function isSlackMessage(message: AgentMessage): boolean {
  return message.from.startsWith('slack:') || message.to.startsWith('slack:');
}

function MessageCard({ message, onClick, onForwardToAgent, onPostToSlack }: {
  message: AgentMessage;
  onClick: () => void;
  onForwardToAgent?: () => void;
  onPostToSlack?: () => void;
}) {
  const slack = isSlackMessage(message);
  const fromColor = slack
    ? 'text-[#611f69]'
    : message.direction === 'outbound' ? 'text-amber-400' : 'text-purple-400';

  return (
    <div
      className="w-full text-left bg-gray-900/40 border rounded-lg p-3 hover:bg-gray-800/30 transition-colors"
      style={slack ? { borderColor: '#611f6940' } : { borderColor: 'rgba(31,41,55,0.3)' }}
    >
      <button onClick={onClick} className="w-full text-left">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium ${fromColor}`}>
            {message.from}
          </span>
          <span className="text-gray-600 text-[10px]">{message.direction === 'outbound' ? '→' : '←'}</span>
          <span className="text-xs font-medium text-gray-300">{message.to}</span>
          {slack && <span className="text-[9px] px-1 rounded" style={{ backgroundColor: '#611f6930', color: '#611f69' }}>slack</span>}
          <span className="text-[10px] text-gray-600 ml-auto">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="text-xs text-gray-400 truncate">{message.body}</div>
      </button>
      {slack && (
        <div className="flex gap-2 mt-2">
          {message.direction === 'inbound' && onForwardToAgent && (
            <button
              onClick={e => { e.stopPropagation(); onForwardToAgent(); }}
              className="text-[10px] px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30"
            >
              Forward to Agent
            </button>
          )}
          {message.direction === 'outbound' && !message.to.startsWith('slack:') && onPostToSlack && (
            <button
              onClick={e => { e.stopPropagation(); onPostToSlack(); }}
              className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
              style={{ backgroundColor: '#611f6930', color: '#611f69' }}
            >
              Post to Slack
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SpawnAgentForm() {
  const [name, setName] = useState('');
  const [profilePath, setProfilePath] = useState('');
  const [spawning, setSpawning] = useState(false);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    window.iDashboard?.getProfiles().then((p: ProfileOption[]) => setProfiles(p ?? []));
  }, []);

  const handleSpawn = async () => {
    if (!name.trim()) return;
    setSpawning(true);
    setError('');
    try {
      const result = await window.iDashboard?.spawnAgent({ name: name.trim(), profilePath: profilePath || undefined }) as { ok: boolean; error?: string } | undefined;
      if (result?.ok) {
        setName('');
        setProfilePath('');
      } else {
        setError(result?.error ?? 'Spawn failed');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSpawning(false);
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 border-b border-gray-800/50 bg-gray-900/40">
      <span className="text-xs text-gray-500 flex-shrink-0">Spawn:</span>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Agent name"
        className="settings-input flex-1"
        onKeyDown={e => { if (e.key === 'Enter') handleSpawn(); }}
      />
      <select
        value={profilePath}
        onChange={e => setProfilePath(e.target.value)}
        className="settings-select flex-1"
      >
        <option value="">No profile</option>
        {profiles.map(p => (
          <option key={p.path} value={p.path}>{p.name}</option>
        ))}
      </select>
      <button
        onClick={handleSpawn}
        disabled={!name.trim() || spawning}
        className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-500 disabled:opacity-40"
      >
        {spawning ? 'Spawning...' : 'Spawn'}
      </button>
      {error && (
        <span className="text-[10px] text-red-400 flex-shrink-0">{error}</span>
      )}
    </div>
  );
}

function TaskBoard() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    window.iDashboard?.getTasks?.().then((t: AgentTask[]) => setTasks(t ?? []));
    const unsub = window.iDashboard?.onTasksChanged?.((t: unknown) => setTasks((t as AgentTask[]) ?? []));
    return () => { unsub?.(); };
  }, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const result = await window.iDashboard?.createTask({ title: newTitle.trim(), createdBy: 'user' }) as { ok: boolean; task?: AgentTask };
      if (result?.ok && result.task) {
        setTasks(prev => [result.task!, ...prev]);
        setNewTitle('');
      }
    } finally {
      setCreating(false);
    }
  };

  const pending = tasks.filter(t => t.status === 'pending');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed');

  if (tasks.length === 0 && !newTitle) return null;

  return (
    <div className="border-b border-gray-800/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-400">Tasks</span>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="New task..."
          className="settings-input flex-1 text-xs"
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
        />
        <button
          onClick={handleCreate}
          disabled={!newTitle.trim() || creating}
          className="px-2 py-1 text-[10px] bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <div className="text-gray-500 mb-1">Pending ({pending.length})</div>
            {pending.map(t => (
              <div key={t.id} className="bg-gray-800/40 rounded px-2 py-1 mb-1 text-gray-300 truncate" title={t.title}>
                {t.title}
              </div>
            ))}
          </div>
          <div>
            <div className="text-yellow-500 mb-1">In Progress ({inProgress.length})</div>
            {inProgress.map(t => (
              <div key={t.id} className="bg-yellow-900/20 border border-yellow-800/30 rounded px-2 py-1 mb-1 text-gray-300 truncate" title={`${t.title} (${t.assignedTo ?? 'unassigned'})`}>
                {t.title}
              </div>
            ))}
          </div>
          <div>
            <div className="text-green-500 mb-1">Done ({completed.length})</div>
            {completed.slice(0, 5).map(t => (
              <div key={t.id} className="bg-green-900/20 rounded px-2 py-1 mb-1 text-gray-500 truncate line-through" title={t.title}>
                {t.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SlackChatSection() {
  const slackChannels = useDashboardStore(s => s.slackChannels);
  const addAgentMessage = useDashboardStore(s => s.addAgentMessage);
  const [channel, setChannel] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  if (slackChannels.length === 0) return null;

  const handleSend = async () => {
    if (!channel || !text.trim()) return;
    setSending(true);
    setStatus(null);
    try {
      const result = await window.iDashboard?.slackSend(channel, text.trim()) as { ok: boolean; error?: string } | undefined;
      if (result?.ok) {
        addAgentMessage({
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: 'you',
          to: `slack:${channel}`,
          body: text.trim(),
          timestamp: Date.now(),
          direction: 'outbound',
        });
        setText('');
        setStatus({ ok: true, msg: 'Sent!' });
      } else {
        setStatus({ ok: false, msg: result?.error ?? 'Send failed' });
      }
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setSending(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 border-b border-gray-800/50" style={{ borderLeftColor: '#611f69', borderLeftWidth: 3 }}>
      <span className="text-xs font-medium" style={{ color: '#611f69' }}>Slack</span>
      <select
        value={channel}
        onChange={e => setChannel(e.target.value)}
        className="settings-select text-xs"
      >
        <option value="">Channel...</option>
        {slackChannels.map(ch => (
          <option key={ch} value={ch}>{ch}</option>
        ))}
      </select>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Message..."
        className="settings-input flex-1 text-xs"
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
      />
      <button
        onClick={handleSend}
        disabled={!channel || !text.trim() || sending}
        className="px-3 py-1.5 text-xs text-white rounded hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: '#611f69' }}
      >
        {sending ? 'Sending...' : 'Send'}
      </button>
      {status && (
        <span className={`text-[10px] ${status.ok ? 'text-green-400' : 'text-red-400'}`}>
          {status.msg}
        </span>
      )}
    </div>
  );
}

function TaskRoutingForm({ agents, prefillTask, onPrefillConsumed }: { agents: AgentInfo[]; prefillTask?: string; onPrefillConsumed?: () => void }) {
  const [targetAgent, setTargetAgent] = useState('');
  const [task, setTask] = useState('');
  const [sending, setSending] = useState(false);

  // Apply prefill when it changes
  if (prefillTask && prefillTask !== task) {
    setTask(prefillTask);
    onPrefillConsumed?.();
  }

  const handleSend = async () => {
    if (!targetAgent || !task.trim()) return;
    setSending(true);
    try {
      await window.iDashboard?.routeTask(targetAgent, task.trim());
      setTask('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex items-start gap-2 p-3 border-t border-gray-800/50">
      <select
        value={targetAgent}
        onChange={e => setTargetAgent(e.target.value)}
        className="settings-select"
      >
        <option value="">Select agent...</option>
        {agents.filter(a => a.status !== 'offline').map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <textarea
        value={task}
        onChange={e => setTask(e.target.value)}
        placeholder="Task to route..."
        className="settings-input flex-1 h-16 resize-y"
      />
      <button
        onClick={handleSend}
        disabled={!targetAgent || !task.trim() || sending}
        className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40"
      >
        {sending ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
}

export function OrchestratorPanel() {
  const agents = useDashboardStore(s => s.agents);
  const messages = useDashboardStore(s => s.agentMessages);
  const modalMessage = useDashboardStore(s => s.modalMessage);
  const setModalMessage = useDashboardStore(s => s.setModalMessage);
  const slackChannels = useDashboardStore(s => s.slackChannels);
  const [prefillTask, setPrefillTask] = useState('');
  const [confirmTerminate, setConfirmTerminate] = useState<string | null>(null);
  const [prefillSlackChannel, setPrefillSlackChannel] = useState('');
  const [prefillSlackText, setPrefillSlackText] = useState('');

  const handleTerminate = async (agentId: string) => {
    if (confirmTerminate !== agentId) {
      setConfirmTerminate(agentId);
      setTimeout(() => setConfirmTerminate(null), 3000); // reset after 3s
      return;
    }
    setConfirmTerminate(null);
    await window.iDashboard?.terminateAgent(agentId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Spawn form — always visible at top */}
      <SpawnAgentForm />

      {/* Agent cards row */}
      <div className="flex-shrink-0 border-b border-gray-800/50">
        {agents.length === 0 ? (
          <div className="px-4 py-4 text-center text-gray-500 text-xs">
            No agents yet. Spawn one above to get started.
          </div>
        ) : (
          <div className="flex gap-2 p-3 overflow-x-auto">
            {agents.map(agent => (
              <AgentCard key={agent.id} agent={agent} onTerminate={handleTerminate} confirmingTerminate={confirmTerminate === agent.id} />
            ))}
          </div>
        )}
      </div>

      {/* Task board */}
      <TaskBoard />

      {/* Slack chat */}
      <SlackChatSection />

      {/* Message feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <span className="text-2xl mb-2">⚡</span>
            <p className="text-sm text-gray-500">No agent messages yet.</p>
            <p className="text-xs text-gray-600 mt-1">Messages between agents will appear here.</p>
          </div>
        ) : (
          messages.slice().reverse().map(msg => (
            <MessageCard
              key={msg.id}
              message={msg}
              onClick={() => setModalMessage(msg)}
              onForwardToAgent={() => setPrefillTask(`[Slack] ${msg.body}`)}
              onPostToSlack={slackChannels.length > 0 ? () => {
                setPrefillSlackChannel(slackChannels[0]);
                setPrefillSlackText(msg.body);
              } : undefined}
            />
          ))
        )}
      </div>

      {/* Task routing */}
      <TaskRoutingForm agents={agents} prefillTask={prefillTask} onPrefillConsumed={() => setPrefillTask('')} />

      {/* Message modal */}
      {modalMessage && (
        <Modal
          title={`${modalMessage.from} → ${modalMessage.to}`}
          onClose={() => setModalMessage(null)}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{new Date(modalMessage.timestamp).toLocaleString()}</span>
              <span className={`px-1.5 py-0.5 rounded ${modalMessage.direction === 'outbound' ? 'bg-amber-600/20 text-amber-400' : 'bg-purple-600/20 text-purple-400'}`}>
                {modalMessage.direction}
              </span>
            </div>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words bg-gray-800/50 rounded p-3 max-h-64 overflow-y-auto">
              {modalMessage.body}
            </pre>
          </div>
        </Modal>
      )}
    </div>
  );
}
