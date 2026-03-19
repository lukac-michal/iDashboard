// ============================================================
// Agent Store - Persistence for agents, messages, and tasks
// ============================================================

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { eq, and, desc, lt, sql } from 'drizzle-orm';
import type { DB } from './connection';
import type { AgentInfo, AgentMessage, AgentTask } from '@shared/types';

// --- Table Definitions ---

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull().default('online'),
  profilePath: text('profile_path'),
  sessionName: text('session_name'),
  registeredAt: integer('registered_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  reportStatus: text('report_status'),
  shortSummary: text('short_summary'),
  lastReportAt: integer('last_report_at'),
});

export const agentMessages = sqliteTable('agent_messages', {
  id: text('id').primaryKey(),
  fromAgent: text('from_agent').notNull(),
  toAgent: text('to_agent').notNull(),
  body: text('body').notNull(),
  timestamp: integer('timestamp').notNull(),
  direction: text('direction').notNull(),
}, (table) => [
  index('idx_agent_messages_timestamp').on(table.timestamp),
]);

export const agentTasks = sqliteTable('agent_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('pending'),
  assignedTo: text('assigned_to'),
  blockedBy: text('blocked_by', { mode: 'json' }),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
  result: text('result'),
});

// --- AgentStore Class ---

export class AgentStore {
  constructor(private db: DB) {}

  upsertAgent(agent: AgentInfo): void {
    this.db.insert(agents).values({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      profilePath: agent.profilePath ?? null,
      sessionName: agent.sessionName ?? null,
      registeredAt: agent.registeredAt,
      lastSeenAt: agent.lastSeenAt,
      reportStatus: agent.reportStatus ?? null,
      shortSummary: agent.shortSummary ?? null,
      lastReportAt: agent.lastReportAt ?? null,
    }).onConflictDoUpdate({
      target: agents.id,
      set: {
        name: sql`excluded.name`,
        status: sql`excluded.status`,
        profilePath: sql`excluded.profile_path`,
        sessionName: sql`excluded.session_name`,
        registeredAt: sql`excluded.registered_at`,
        lastSeenAt: sql`excluded.last_seen_at`,
        reportStatus: sql`excluded.report_status`,
        shortSummary: sql`excluded.short_summary`,
        lastReportAt: sql`excluded.last_report_at`,
      },
    }).run();
  }

  getAgent(id: string): AgentInfo | null {
    const row = this.db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1)
      .get();
    return row ? this.rowToAgentInfo(row) : null;
  }

  getAllAgents(): AgentInfo[] {
    return this.db
      .select()
      .from(agents)
      .all()
      .map(this.rowToAgentInfo);
  }

  deleteAgent(id: string): boolean {
    const result = this.db
      .delete(agents)
      .where(eq(agents.id, id))
      .run();
    return result.changes > 0;
  }

  insertMessage(msg: AgentMessage): void {
    this.db.insert(agentMessages).values({
      id: msg.id,
      fromAgent: msg.from,
      toAgent: msg.to,
      body: msg.body,
      timestamp: msg.timestamp,
      direction: msg.direction,
    }).run();
  }

  getMessages(limit = 100): AgentMessage[] {
    return this.db
      .select()
      .from(agentMessages)
      .orderBy(desc(agentMessages.timestamp))
      .limit(limit)
      .all()
      .map(this.rowToAgentMessage);
  }

  getMessagesForAgent(agentId: string, limit = 100): AgentMessage[] {
    return this.db
      .select()
      .from(agentMessages)
      .where(
        sql`${agentMessages.fromAgent} = ${agentId} OR ${agentMessages.toAgent} = ${agentId}`,
      )
      .orderBy(desc(agentMessages.timestamp))
      .limit(limit)
      .all()
      .map(this.rowToAgentMessage);
  }

  insertTask(task: AgentTask): void {
    this.db.insert(agentTasks).values({
      id: task.id,
      title: task.title,
      status: task.status,
      assignedTo: task.assignedTo ?? null,
      blockedBy: task.blockedBy ?? null,
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      completedAt: task.completedAt ?? null,
      result: task.result ?? null,
    }).run();
  }

  updateTask(id: string, updates: Partial<AgentTask>): boolean {
    const setValues: Record<string, unknown> = {};
    if (updates.title !== undefined) setValues.title = updates.title;
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.assignedTo !== undefined) setValues.assignedTo = updates.assignedTo;
    if (updates.blockedBy !== undefined) setValues.blockedBy = updates.blockedBy;
    if (updates.completedAt !== undefined) setValues.completedAt = updates.completedAt;
    if (updates.result !== undefined) setValues.result = updates.result;

    if (Object.keys(setValues).length === 0) return false;

    const result = this.db
      .update(agentTasks)
      .set(setValues)
      .where(eq(agentTasks.id, id))
      .run();
    return result.changes > 0;
  }

  getTask(id: string): AgentTask | null {
    const row = this.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, id))
      .limit(1)
      .get();
    return row ? this.rowToAgentTask(row) : null;
  }

  getTasks(filter?: { status?: string; assignedTo?: string }): AgentTask[] {
    const conditions = [];
    if (filter?.status) {
      conditions.push(eq(agentTasks.status, filter.status));
    }
    if (filter?.assignedTo) {
      conditions.push(eq(agentTasks.assignedTo, filter.assignedTo));
    }

    let query = this.db.select().from(agentTasks);
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as typeof query;
    }
    return query.orderBy(desc(agentTasks.createdAt)).all().map(this.rowToAgentTask);
  }

  purgeOldAgents(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.db
      .delete(agents)
      .where(lt(agents.lastSeenAt, cutoff))
      .run();
    return result.changes;
  }

  purgeOldMessages(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.db
      .delete(agentMessages)
      .where(lt(agentMessages.timestamp, cutoff))
      .run();
    return result.changes;
  }

  private rowToAgentInfo(row: typeof agents.$inferSelect): AgentInfo {
    return {
      id: row.id,
      name: row.name,
      status: row.status as AgentInfo['status'],
      profilePath: row.profilePath ?? undefined,
      sessionName: row.sessionName ?? undefined,
      registeredAt: row.registeredAt,
      lastSeenAt: row.lastSeenAt,
      reportStatus: row.reportStatus as AgentInfo['reportStatus'],
      shortSummary: row.shortSummary ?? undefined,
      lastReportAt: row.lastReportAt ?? undefined,
    };
  }

  private rowToAgentMessage(row: typeof agentMessages.$inferSelect): AgentMessage {
    return {
      id: row.id,
      from: row.fromAgent,
      to: row.toAgent,
      body: row.body,
      timestamp: row.timestamp,
      direction: row.direction as AgentMessage['direction'],
    };
  }

  private rowToAgentTask(row: typeof agentTasks.$inferSelect): AgentTask {
    return {
      id: row.id,
      title: row.title,
      status: row.status as AgentTask['status'],
      assignedTo: row.assignedTo ?? undefined,
      blockedBy: (row.blockedBy as string[]) ?? undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      completedAt: row.completedAt ?? undefined,
      result: row.result ?? undefined,
    };
  }
}
