// ============================================================
// TaskManager Tests - Create, claim, complete, filter tasks
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@main/db/schema';
import { agents, agentMessages, agentTasks, AgentStore } from '@main/db/agent-store';
import { TaskManager } from '@main/services/task-manager';

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

describe('TaskManager', () => {
  let store: AgentStore;
  let manager: TaskManager;

  beforeEach(() => {
    const { db } = createTestDb();
    store = new AgentStore(db as never);
    manager = new TaskManager(store);
  });

  describe('createTask', () => {
    it('creates a task with pending status', () => {
      const task = manager.createTask('Build feature', 'user');
      expect(task.id).toMatch(/^task-/);
      expect(task.title).toBe('Build feature');
      expect(task.status).toBe('pending');
      expect(task.createdBy).toBe('user');
      expect(task.createdAt).toBeGreaterThan(0);
    });

    it('creates a task with assignee', () => {
      const task = manager.createTask('Build feature', 'user', 'worker-1');
      expect(task.assignedTo).toBe('worker-1');
    });

    it('creates a task with blockedBy', () => {
      const task = manager.createTask('Deploy', 'user', undefined, ['task-1', 'task-2']);
      expect(task.blockedBy).toEqual(['task-1', 'task-2']);
    });

    it('emits task:created event', () => {
      const handler = vi.fn();
      manager.on('task:created', handler);
      const task = manager.createTask('Test', 'user');
      expect(handler).toHaveBeenCalledWith(task);
    });
  });

  describe('claimTask', () => {
    it('claims a pending task', () => {
      const task = manager.createTask('Build feature', 'user');
      const claimed = manager.claimTask(task.id, 'agent-1');
      expect(claimed).not.toBeNull();
      expect(claimed!.status).toBe('in_progress');
      expect(claimed!.assignedTo).toBe('agent-1');
    });

    it('returns null for non-existent task', () => {
      expect(manager.claimTask('nope', 'agent-1')).toBeNull();
    });

    it('returns null for non-pending task', () => {
      const task = manager.createTask('Build feature', 'user');
      manager.claimTask(task.id, 'agent-1');
      // Try to claim again (now in_progress)
      expect(manager.claimTask(task.id, 'agent-2')).toBeNull();
    });

    it('returns null for blocked task', () => {
      const blocker = manager.createTask('Blocker', 'user');
      const blocked = manager.createTask('Blocked', 'user', undefined, [blocker.id]);
      expect(manager.claimTask(blocked.id, 'agent-1')).toBeNull();
    });

    it('allows claiming when blocker is completed', () => {
      const blocker = manager.createTask('Blocker', 'user');
      const blocked = manager.createTask('Blocked', 'user', undefined, [blocker.id]);
      manager.completeTask(blocker.id);
      const claimed = manager.claimTask(blocked.id, 'agent-1');
      expect(claimed).not.toBeNull();
      expect(claimed!.status).toBe('in_progress');
    });

    it('emits task:updated event', () => {
      const handler = vi.fn();
      manager.on('task:updated', handler);
      const task = manager.createTask('Test', 'user');
      manager.claimTask(task.id, 'agent-1');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('completeTask', () => {
    it('completes a task', () => {
      const task = manager.createTask('Build feature', 'user');
      const completed = manager.completeTask(task.id, 'All done');
      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('completed');
      expect(completed!.completedAt).toBeGreaterThan(0);
      expect(completed!.result).toBe('All done');
    });

    it('returns null for non-existent task', () => {
      expect(manager.completeTask('nope')).toBeNull();
    });

    it('emits task:completed event', () => {
      const handler = vi.fn();
      manager.on('task:completed', handler);
      const task = manager.createTask('Test', 'user');
      manager.completeTask(task.id);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getTask', () => {
    it('returns a task by id', () => {
      const created = manager.createTask('Test', 'user');
      const task = manager.getTask(created.id);
      expect(task).not.toBeNull();
      expect(task!.title).toBe('Test');
    });

    it('returns null for non-existent', () => {
      expect(manager.getTask('nope')).toBeNull();
    });
  });

  describe('getTasks', () => {
    it('returns all tasks', () => {
      manager.createTask('A', 'user');
      manager.createTask('B', 'user');
      expect(manager.getTasks()).toHaveLength(2);
    });

    it('filters by status', () => {
      const task = manager.createTask('A', 'user');
      manager.createTask('B', 'user');
      manager.completeTask(task.id);
      const pending = manager.getTasks({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].title).toBe('B');
    });

    it('filters by assignedTo', () => {
      const task = manager.createTask('A', 'user', 'agent-1');
      manager.createTask('B', 'user', 'agent-2');
      const result = manager.getTasks({ assignedTo: 'agent-1' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(task.id);
    });
  });

  describe('updateTask', () => {
    it('updates task fields', () => {
      const task = manager.createTask('Test', 'user');
      const updated = manager.updateTask(task.id, { title: 'Updated' });
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('Updated');
    });

    it('returns null for non-existent task', () => {
      expect(manager.updateTask('nope', { title: 'Nope' })).toBeNull();
    });

    it('emits task:updated event', () => {
      const handler = vi.fn();
      manager.on('task:updated', handler);
      const task = manager.createTask('Test', 'user');
      manager.updateTask(task.id, { title: 'Updated' });
      expect(handler).toHaveBeenCalled();
    });
  });
});
