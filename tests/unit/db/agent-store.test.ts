// ============================================================
// AgentStore Tests - CRUD for agents, messages, and tasks
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@main/db/schema';
import { agents, agentMessages, agentTasks, AgentStore } from '@main/db/agent-store';
import type { AgentInfo, AgentMessage, AgentTask } from '@shared/types';

// Suppress log output in tests
vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const allSchema = { ...schema, agents, agentMessages, agentTasks };

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      profile_path TEXT,
      session_name TEXT,
      registered_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      report_status TEXT,
      short_summary TEXT,
      last_report_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      body TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      direction TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_messages_timestamp ON agent_messages(timestamp);

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_to TEXT,
      blocked_by TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      result TEXT
    );
  `);
  const db = drizzle(sqlite, { schema: allSchema });
  return { db, sqlite };
}

function makeAgent(id: string, name?: string): AgentInfo {
  return {
    id,
    name: name ?? id,
    status: 'online',
    registeredAt: Date.now(),
    lastSeenAt: Date.now(),
  };
}

function makeMessage(id: string, from: string, to: string): AgentMessage {
  return {
    id,
    from,
    to,
    body: `Message ${id}`,
    timestamp: Date.now(),
    direction: 'outbound',
  };
}

function makeTask(id: string, createdBy: string): AgentTask {
  return {
    id,
    title: `Task ${id}`,
    status: 'pending',
    createdBy,
    createdAt: Date.now(),
  };
}

describe('AgentStore', () => {
  let store: AgentStore;

  beforeEach(() => {
    const { db } = createTestDb();
    store = new AgentStore(db as never);
  });

  // --- Agent CRUD ---

  describe('agents', () => {
    it('upserts and retrieves an agent', () => {
      const agent = makeAgent('a1', 'frontend');
      store.upsertAgent(agent);
      const result = store.getAgent('a1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('a1');
      expect(result!.name).toBe('frontend');
      expect(result!.status).toBe('online');
    });

    it('updates existing agent on upsert', () => {
      const agent = makeAgent('a1', 'frontend');
      store.upsertAgent(agent);
      store.upsertAgent({ ...agent, status: 'busy', name: 'frontend-v2' });
      const result = store.getAgent('a1');
      expect(result!.status).toBe('busy');
      expect(result!.name).toBe('frontend-v2');
    });

    it('returns null for non-existent agent', () => {
      expect(store.getAgent('nope')).toBeNull();
    });

    it('getAllAgents returns all agents', () => {
      store.upsertAgent(makeAgent('a1', 'one'));
      store.upsertAgent(makeAgent('a2', 'two'));
      const all = store.getAllAgents();
      expect(all).toHaveLength(2);
    });

    it('deleteAgent removes an agent', () => {
      store.upsertAgent(makeAgent('a1'));
      expect(store.deleteAgent('a1')).toBe(true);
      expect(store.getAgent('a1')).toBeNull();
    });

    it('deleteAgent returns false for non-existent', () => {
      expect(store.deleteAgent('nope')).toBe(false);
    });

    it('persists optional fields', () => {
      const agent: AgentInfo = {
        id: 'a1',
        name: 'worker',
        status: 'online',
        profilePath: '/profiles/worker.yaml',
        sessionName: 'sess-1',
        registeredAt: 1000,
        lastSeenAt: 2000,
        reportStatus: 'working',
        shortSummary: 'Doing stuff',
        lastReportAt: 1500,
      };
      store.upsertAgent(agent);
      const result = store.getAgent('a1')!;
      expect(result.profilePath).toBe('/profiles/worker.yaml');
      expect(result.sessionName).toBe('sess-1');
      expect(result.reportStatus).toBe('working');
      expect(result.shortSummary).toBe('Doing stuff');
      expect(result.lastReportAt).toBe(1500);
    });

    it('purgeOldAgents removes stale agents', () => {
      const old = makeAgent('old');
      old.lastSeenAt = Date.now() - 100000;
      const recent = makeAgent('recent');
      store.upsertAgent(old);
      store.upsertAgent(recent);
      const purged = store.purgeOldAgents(50000);
      expect(purged).toBe(1);
      expect(store.getAgent('old')).toBeNull();
      expect(store.getAgent('recent')).not.toBeNull();
    });
  });

  // --- Message CRUD ---

  describe('messages', () => {
    it('inserts and retrieves messages', () => {
      store.insertMessage(makeMessage('m1', 'master', 'worker'));
      const messages = store.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('m1');
      expect(messages[0].from).toBe('master');
      expect(messages[0].to).toBe('worker');
    });

    it('getMessages respects limit', () => {
      for (let i = 0; i < 10; i++) {
        const msg = makeMessage(`m${i}`, 'master', 'worker');
        msg.timestamp = Date.now() + i;
        store.insertMessage(msg);
      }
      const messages = store.getMessages(3);
      expect(messages).toHaveLength(3);
    });

    it('getMessages returns in descending timestamp order', () => {
      const m1 = makeMessage('m1', 'master', 'worker');
      m1.timestamp = 1000;
      const m2 = makeMessage('m2', 'worker', 'master');
      m2.timestamp = 2000;
      store.insertMessage(m1);
      store.insertMessage(m2);
      const messages = store.getMessages();
      expect(messages[0].id).toBe('m2');
      expect(messages[1].id).toBe('m1');
    });

    it('getMessagesForAgent filters by agent', () => {
      store.insertMessage(makeMessage('m1', 'master', 'worker'));
      store.insertMessage(makeMessage('m2', 'other', 'someone'));
      store.insertMessage(makeMessage('m3', 'worker', 'master'));
      const messages = store.getMessagesForAgent('worker');
      expect(messages).toHaveLength(2);
    });

    it('purgeOldMessages removes old messages', () => {
      const old = makeMessage('m-old', 'a', 'b');
      old.timestamp = Date.now() - 100000;
      const recent = makeMessage('m-new', 'a', 'b');
      store.insertMessage(old);
      store.insertMessage(recent);
      const purged = store.purgeOldMessages(50000);
      expect(purged).toBe(1);
      expect(store.getMessages()).toHaveLength(1);
    });
  });

  // --- Task CRUD ---

  describe('tasks', () => {
    it('inserts and retrieves a task', () => {
      store.insertTask(makeTask('t1', 'master'));
      const task = store.getTask('t1');
      expect(task).not.toBeNull();
      expect(task!.id).toBe('t1');
      expect(task!.title).toBe('Task t1');
      expect(task!.status).toBe('pending');
      expect(task!.createdBy).toBe('master');
    });

    it('returns null for non-existent task', () => {
      expect(store.getTask('nope')).toBeNull();
    });

    it('updateTask updates fields', () => {
      store.insertTask(makeTask('t1', 'master'));
      const updated = store.updateTask('t1', {
        status: 'in_progress',
        assignedTo: 'worker-1',
      });
      expect(updated).toBe(true);
      const task = store.getTask('t1')!;
      expect(task.status).toBe('in_progress');
      expect(task.assignedTo).toBe('worker-1');
    });

    it('updateTask returns false for non-existent task', () => {
      expect(store.updateTask('nope', { status: 'completed' })).toBe(false);
    });

    it('updateTask returns false for empty updates', () => {
      store.insertTask(makeTask('t1', 'master'));
      expect(store.updateTask('t1', {})).toBe(false);
    });

    it('getTasks returns all tasks', () => {
      store.insertTask(makeTask('t1', 'master'));
      store.insertTask(makeTask('t2', 'master'));
      expect(store.getTasks()).toHaveLength(2);
    });

    it('getTasks filters by status', () => {
      const t1 = makeTask('t1', 'master');
      const t2 = makeTask('t2', 'master');
      t2.status = 'completed';
      store.insertTask(t1);
      store.insertTask(t2);
      const pending = store.getTasks({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('t1');
    });

    it('getTasks filters by assignedTo', () => {
      const t1 = makeTask('t1', 'master');
      t1.assignedTo = 'worker-1';
      const t2 = makeTask('t2', 'master');
      t2.assignedTo = 'worker-2';
      store.insertTask(t1);
      store.insertTask(t2);
      const result = store.getTasks({ assignedTo: 'worker-1' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t1');
    });

    it('getTasks filters by both status and assignedTo', () => {
      const t1 = makeTask('t1', 'master');
      t1.assignedTo = 'worker-1';
      t1.status = 'in_progress';
      const t2 = makeTask('t2', 'master');
      t2.assignedTo = 'worker-1';
      t2.status = 'completed';
      store.insertTask(t1);
      store.insertTask(t2);
      const result = store.getTasks({ status: 'in_progress', assignedTo: 'worker-1' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t1');
    });

    it('persists blockedBy as JSON array', () => {
      const task = makeTask('t1', 'master');
      task.blockedBy = ['t0', 't-1'];
      store.insertTask(task);
      const result = store.getTask('t1')!;
      expect(result.blockedBy).toEqual(['t0', 't-1']);
    });

    it('persists completedAt and result', () => {
      const task = makeTask('t1', 'master');
      store.insertTask(task);
      store.updateTask('t1', {
        status: 'completed',
        completedAt: 99999,
        result: 'All done',
      });
      const result = store.getTask('t1')!;
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBe(99999);
      expect(result.result).toBe('All done');
    });
  });
});
