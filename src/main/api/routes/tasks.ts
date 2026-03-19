// ============================================================
// Task API Routes - CRUD for agent tasks
// ============================================================

import type { FastifyInstance } from 'fastify';
import type { TaskManager } from '@main/services/task-manager';
import type { AgentTaskStatus } from '@shared/types';

export function registerTaskRoutes(fastify: FastifyInstance, taskManager: TaskManager): void {
  // Create task
  fastify.post('/api/v1/tasks', async (request, reply) => {
    const { title, createdBy, assignTo, blockedBy } = request.body as {
      title: string;
      createdBy: string;
      assignTo?: string;
      blockedBy?: string[];
    };
    if (!title || !createdBy) {
      return reply.status(400).send({ ok: false, error: 'title and createdBy are required' });
    }
    const task = taskManager.createTask(title, createdBy, assignTo, blockedBy);
    return { ok: true, task };
  });

  // List tasks
  fastify.get('/api/v1/tasks', async (request) => {
    const { status, assignedTo } = request.query as { status?: AgentTaskStatus; assignedTo?: string };
    return taskManager.getTasks(status || assignedTo ? { status, assignedTo } : undefined);
  });

  // Get single task
  fastify.get('/api/v1/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = taskManager.getTask(id);
    if (!task) return reply.status(404).send({ ok: false, error: 'Task not found' });
    return task;
  });

  // Update task (claim, complete, reassign)
  fastify.patch('/api/v1/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: AgentTaskStatus; assignedTo?: string; result?: string };

    // Special handling for claim and complete
    if (body.status === 'in_progress' && body.assignedTo) {
      const task = taskManager.claimTask(id, body.assignedTo);
      if (!task) return reply.status(409).send({ ok: false, error: 'Cannot claim task (not pending or blocked)' });
      return { ok: true, task };
    }

    if (body.status === 'completed') {
      const task = taskManager.completeTask(id, body.result);
      if (!task) return reply.status(404).send({ ok: false, error: 'Task not found' });
      return { ok: true, task };
    }

    const task = taskManager.updateTask(id, body);
    if (!task) return reply.status(404).send({ ok: false, error: 'Task not found' });
    return { ok: true, task };
  });
}
