// ============================================================
// Tracing Service - Arize Phoenix / OpenTelemetry integration
// ============================================================
//
// Provides distributed tracing for multi-agent orchestration.
// When enabled, traces task creation, delegation, agent reports,
// and task completion as OTEL spans sent to a Phoenix collector.
//
// Requires a running Phoenix instance:
//   docker run -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
//
// Enable in config.yaml:
//   experimental:
//     phoenixEnabled: true
//     phoenixUrl: "http://localhost:6006"

import { trace, context, SpanStatusCode, type Tracer, type Span } from '@opentelemetry/api';
import { log, warn } from '@main/utils/log';

let tracer: Tracer | null = null;
let initialized = false;

// Map taskId -> span for correlating task lifecycle events
const activeTaskSpans = new Map<string, Span>();

// Map agentName -> span for correlating agent work
const activeAgentSpans = new Map<string, Span>();

/**
 * Initialize the tracing service with Phoenix OTEL.
 * Call once at app startup when phoenix is enabled.
 */
export async function initTracing(phoenixUrl: string, projectName = 'idashboard'): Promise<boolean> {
  if (initialized) return true;

  try {
    // Dynamic import — @arizeai/phoenix-otel is ESM-heavy and may not be available
    const phoenixOtel = await import('@arizeai/phoenix-otel');
    phoenixOtel.register({
      projectName,
      collectorEndpoint: phoenixUrl,
    });
    tracer = trace.getTracer('idashboard', '0.7.0');
    initialized = true;
    log('Tracing', `Phoenix tracing initialized, collector: ${phoenixUrl}`);
    return true;
  } catch (err) {
    warn('Tracing', `Failed to initialize Phoenix tracing: ${err}`);
    return false;
  }
}

/**
 * Check if tracing is active.
 */
export function isTracingEnabled(): boolean {
  return initialized && tracer !== null;
}

/**
 * Trace a task creation event. Opens a span that stays open until
 * the task is completed or the app shuts down.
 */
export function traceTaskCreated(taskId: string, title: string, createdBy: string, assignedTo?: string): void {
  if (!tracer) return;

  const span = tracer.startSpan('task.created', {
    attributes: {
      'task.id': taskId,
      'task.title': title,
      'task.created_by': createdBy,
      'task.assigned_to': assignedTo ?? 'unassigned',
      'task.status': 'pending',
    },
  });

  activeTaskSpans.set(taskId, span);
}

/**
 * Trace a task being claimed by an agent.
 */
export function traceTaskClaimed(taskId: string, agentName: string): void {
  if (!tracer) return;

  const parentSpan = activeTaskSpans.get(taskId);
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();

  const span = tracer.startSpan('task.claimed', {
    attributes: {
      'task.id': taskId,
      'agent.name': agentName,
      'task.status': 'in_progress',
    },
  }, ctx);
  span.end();
}

/**
 * Trace a task being dispatched to an agent's terminal.
 */
export function traceTaskDispatched(taskId: string, agentName: string): void {
  if (!tracer) return;

  const parentSpan = activeTaskSpans.get(taskId);
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();

  const span = tracer.startSpan('task.dispatched', {
    attributes: {
      'task.id': taskId,
      'agent.name': agentName,
    },
  }, ctx);
  span.end();
}

/**
 * Trace a task completion. Closes the parent task span.
 */
export function traceTaskCompleted(taskId: string, assignedTo?: string, result?: string): void {
  if (!tracer) return;

  const parentSpan = activeTaskSpans.get(taskId);
  if (parentSpan) {
    parentSpan.setAttribute('task.status', 'completed');
    if (assignedTo) parentSpan.setAttribute('task.completed_by', assignedTo);
    if (result) parentSpan.setAttribute('task.result', result.slice(0, 500));
    parentSpan.setStatus({ code: SpanStatusCode.OK });
    parentSpan.end();
    activeTaskSpans.delete(taskId);
  }
}

/**
 * Trace an agent status report. Creates a span under the agent's
 * active work span if one exists.
 */
export function traceAgentReport(agentName: string, status: string, summary: string): void {
  if (!tracer) return;

  // If agent reports 'working', start a new agent work span
  if (status === 'working') {
    // End any existing span for this agent
    const existing = activeAgentSpans.get(agentName);
    if (existing) existing.end();

    const span = tracer.startSpan('agent.working', {
      attributes: {
        'agent.name': agentName,
        'agent.status': status,
        'agent.summary': summary.slice(0, 200),
      },
    });
    activeAgentSpans.set(agentName, span);
    return;
  }

  // For done/question/blocked/error, end the agent's work span
  const agentSpan = activeAgentSpans.get(agentName);
  if (agentSpan) {
    agentSpan.setAttribute('agent.status', status);
    agentSpan.setAttribute('agent.summary', summary.slice(0, 200));
    if (status === 'error') {
      agentSpan.setStatus({ code: SpanStatusCode.ERROR, message: summary });
    } else {
      agentSpan.setStatus({ code: SpanStatusCode.OK });
    }
    agentSpan.end();
    activeAgentSpans.delete(agentName);
  } else {
    // No active span — create a standalone event span
    const span = tracer.startSpan(`agent.${status}`, {
      attributes: {
        'agent.name': agentName,
        'agent.status': status,
        'agent.summary': summary.slice(0, 200),
      },
    });
    span.end();
  }
}

/**
 * Trace a message sent between agents.
 */
export function traceMessage(from: string, to: string, bodyPreview: string): void {
  if (!tracer) return;

  const span = tracer.startSpan('agent.message', {
    attributes: {
      'message.from': from,
      'message.to': to,
      'message.body_preview': bodyPreview.slice(0, 200),
    },
  });
  span.end();
}

/**
 * Trace an agent being spawned.
 */
export function traceAgentSpawned(agentName: string, profile?: string): void {
  if (!tracer) return;

  const span = tracer.startSpan('agent.spawned', {
    attributes: {
      'agent.name': agentName,
      'agent.profile': profile ?? 'none',
    },
  });
  span.end();
}

/**
 * Trace a task being unblocked by dependency completion.
 */
export function traceTaskUnblocked(taskId: string, unblockedBy: string): void {
  if (!tracer) return;

  const parentSpan = activeTaskSpans.get(taskId);
  const ctx = parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active();

  const span = tracer.startSpan('task.unblocked', {
    attributes: {
      'task.id': taskId,
      'task.unblocked_by': unblockedBy,
    },
  }, ctx);
  span.end();
}

/**
 * Shutdown tracing — flush any pending spans.
 */
export async function shutdownTracing(): Promise<void> {
  // End any lingering spans
  for (const [, span] of activeTaskSpans) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'App shutdown before completion' });
    span.end();
  }
  activeTaskSpans.clear();

  for (const [, span] of activeAgentSpans) {
    span.end();
  }
  activeAgentSpans.clear();

  initialized = false;
  tracer = null;
  log('Tracing', 'Tracing shut down');
}
