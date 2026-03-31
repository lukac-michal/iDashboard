// ============================================================
// TaskManager - Create, claim, complete, and track agent tasks
// ============================================================

import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import { log } from '@main/utils/log';
import { traceTaskCreated, traceTaskClaimed, traceTaskCompleted } from './tracing';
import type { AgentStore } from '@main/db/agent-store';
import type { AgentTask, AgentTaskStatus } from '@shared/types';

export class TaskManager extends EventEmitter {
  private store: AgentStore;

  constructor(store: AgentStore) {
    super();
    this.store = store;
  }

  createTask(title: string, createdBy: string, assignTo?: string, blockedBy?: string[]): AgentTask {
    const task: AgentTask = {
      id: `task-${nanoid(8)}`,
      title,
      status: 'pending',
      assignedTo: assignTo,
      blockedBy: blockedBy?.length ? blockedBy : undefined,
      createdBy,
      createdAt: Date.now(),
    };
    this.store.insertTask(task);
    traceTaskCreated(task.id, title, createdBy, assignTo);
    log('TaskManager', `Created task: ${task.id} - ${title}`);
    this.emit('task:created', task);
    return task;
  }

  claimTask(taskId: string, agentId: string): AgentTask | null {
    const task = this.store.getTask(taskId);
    if (!task) return null;
    if (task.status !== 'pending') return null;

    // Check if blocked
    if (task.blockedBy?.length) {
      const blocking = task.blockedBy.filter(id => {
        const blocker = this.store.getTask(id);
        return blocker && blocker.status !== 'completed';
      });
      if (blocking.length > 0) return null;
    }

    this.store.updateTask(taskId, { status: 'in_progress', assignedTo: agentId });
    const updated = this.store.getTask(taskId)!;
    traceTaskClaimed(taskId, agentId);
    log('TaskManager', `Task ${taskId} claimed by ${agentId}`);
    this.emit('task:updated', updated);
    return updated;
  }

  completeTask(taskId: string, result?: string): AgentTask | null {
    const task = this.store.getTask(taskId);
    if (!task) return null;

    this.store.updateTask(taskId, {
      status: 'completed',
      completedAt: Date.now(),
      result,
    });
    const updated = this.store.getTask(taskId)!;
    traceTaskCompleted(taskId, updated.assignedTo, result);
    log('TaskManager', `Task ${taskId} completed`);
    this.emit('task:completed', updated);
    return updated;
  }

  getTask(taskId: string): AgentTask | null {
    return this.store.getTask(taskId);
  }

  getTasks(filter?: { status?: AgentTaskStatus; assignedTo?: string }): AgentTask[] {
    return this.store.getTasks(filter);
  }

  updateTask(taskId: string, updates: Partial<AgentTask>): AgentTask | null {
    const success = this.store.updateTask(taskId, updates);
    if (!success) return null;
    const updated = this.store.getTask(taskId)!;
    this.emit('task:updated', updated);
    return updated;
  }
}
