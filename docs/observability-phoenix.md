# Agent Observability with Arize Phoenix

## Background and Research

### The Problem

iDashboard orchestrates multiple Claude Code agents (ProjectManager, Architect, Implementer, Reviewer) that communicate via REST API. When a multi-agent workflow runs, it's difficult to understand:

- How long each agent takes to complete its work
- The full delegation chain (PM -> Architect -> Implementer -> Reviewer)
- Where bottlenecks or failures occur
- Token costs per agent per task
- Whether agents are idle, blocked, or actively working

The built-in dashboard shows real-time status but doesn't provide historical trace analysis, timing breakdowns, or workflow visualization.

### Tools Evaluated

| Tool | Type | Pros | Cons |
|------|------|------|------|
| **Arize Phoenix** | LLM observability | Open-source, OTEL-native, Agent Graph UI, TypeScript SDK, self-hosted | Newer project, Python-centric docs |
| **LangFuse** | LLM observability | Open-source, good dashboard, prompt management | LangChain-oriented, heavier integration |
| **OpenTelemetry + Jaeger** | General tracing | Industry standard, battle-tested | No LLM-specific features, more setup |
| **Langsmith** | LLM observability | Best LangChain integration | Proprietary, cloud-only, vendor lock-in |
| **Arize (Cloud)** | Full platform | Enterprise features, managed | Expensive, cloud-only |

### Decision: Arize Phoenix

Selected for these reasons:

1. **Built on OpenTelemetry** — Not vendor-locked. If Phoenix doesn't work out, the OTEL spans can be sent to Jaeger, Zipkin, or Grafana Tempo instead. Zero code changes needed.
2. **TypeScript SDK** — `@arizeai/phoenix-otel` provides native Node.js support. No Python dependency in the Electron app.
3. **Agent Graph UI** — Phoenix has a dedicated visualization that shows agent workflows as node graphs, which maps directly to our PM -> Architect -> Implementer chain.
4. **Self-hosted via Docker** — Single `docker run` command. No cloud account, no data leaves the machine.
5. **Lightweight integration** — Phoenix acts as an OTEL collector. We emit standard OTEL spans. The integration is ~200 lines of code in one file.

### Phoenix Architecture

```
┌─────────────────────────────────────────────────────┐
│  iDashboard (Electron main process)                  │
│                                                       │
│  TaskManager ──┐                                     │
│  AgentReport ──┤── tracing.ts ──► OTEL Spans ──┐    │
│  MasterAgent ──┘                                │    │
│                                                  │    │
└──────────────────────────────────────────────────┼────┘
                                                   │
                                          HTTP/gRPC│
                                                   ▼
┌─────────────────────────────────────────────────────┐
│  Arize Phoenix (Docker container)                    │
│                                                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  OTLP    │  │  Storage     │  │  Web UI       │  │
│  │ Collector │→│  (SQLite or  │→│  :6006         │  │
│  │ :4317    │  │  PostgreSQL) │  │  Traces, Graph │  │
│  └──────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────┘
```

Phoenix provides:
- **OTLP HTTP collector** on port 6006
- **OTLP gRPC collector** on port 4317
- **Web UI** on port 6006 (same as HTTP collector)
- **Storage**: SQLite by default (development), PostgreSQL for production
- **REST API** at `/v1/projects`, `/v1/spans`, `/v1/datasets` for programmatic access

---

## Implementation

### npm Packages

```json
{
  "@arizeai/phoenix-otel": "^1.x",
  "@opentelemetry/api": "^1.x"
}
```

`@arizeai/phoenix-otel` is a thin wrapper around OpenTelemetry that:
- Registers a `NodeTracerProvider` with a `BatchSpanProcessor`
- Configures the OTLP exporter to point at the Phoenix collector
- Sets up OpenInference semantic conventions for AI/LLM spans

`@opentelemetry/api` provides the standard tracing API (`trace`, `context`, `Span`, `SpanStatusCode`).

### Configuration

Two new optional fields in `config.experimental`:

```yaml
# ~/.idashboard/config.yaml
experimental:
  enabled: true
  phoenixEnabled: true                    # Enable Phoenix tracing
  phoenixUrl: "http://localhost:6006"     # Phoenix collector URL
```

TypeScript type (in `src/shared/types.ts`):

```typescript
experimental: {
  // ... existing fields ...
  phoenixEnabled?: boolean;
  phoenixUrl?: string;
};
```

Both fields are optional. When omitted or false, tracing is completely disabled with zero runtime cost.

### Tracing Service

**File**: `src/main/services/tracing.ts`

The service provides 8 exported functions:

| Function | Purpose | When called |
|----------|---------|-------------|
| `initTracing(url, project?)` | Connect to Phoenix collector | App startup (if enabled) |
| `isTracingEnabled()` | Check if tracing is active | Guard checks |
| `traceTaskCreated(id, title, by, assignTo?)` | Open task span | `TaskManager.createTask()` |
| `traceTaskClaimed(id, agent)` | Child span: agent claimed task | `TaskManager.claimTask()` |
| `traceTaskDispatched(id, agent)` | Child span: task sent to terminal | Auto-dispatch in `index.ts` |
| `traceTaskCompleted(id, agent?, result?)` | Close task span | `TaskManager.completeTask()` |
| `traceAgentReport(name, status, summary)` | Agent lifecycle spans | `POST /api/v1/agent-report` |
| `traceMessage(from, to, preview)` | Message span | `MasterAgentService.addMessage()` |
| `shutdownTracing()` | Flush and clean up | App quit |

### Design Decisions

**1. All trace functions are no-ops when disabled**

Every function starts with `if (!tracer) return;`. When Phoenix is not configured, there is zero overhead — no objects created, no functions called, no conditionals beyond the null check.

**2. Dynamic import for Phoenix SDK**

```typescript
const phoenixOtel = await import('@arizeai/phoenix-otel');
```

The `@arizeai/phoenix-otel` package is imported dynamically rather than statically. This prevents the app from crashing if the package has issues or if its transitive dependencies (OTEL SDK, gRPC) fail to load. The `initTracing` function catches any errors and returns `false`.

**3. Task spans stay open across the full lifecycle**

When a task is created, a span is opened and stored in `activeTaskSpans` Map. Subsequent events (claim, dispatch, complete) create child spans under it. The parent span is only ended when `traceTaskCompleted()` is called. This produces a trace tree like:

```
task.created [task-abc] (duration: 45s)
  ├── task.claimed [Implementer] (instant)
  ├── task.dispatched [Implementer] (instant)
  └── task.completed (instant, closes parent)
```

**4. Agent work spans track working → done/error lifecycle**

When an agent reports `working`, a span opens. When it reports `done`, `error`, `question`, or `blocked`, the span closes with the appropriate status. This captures how long each agent actively works.

**5. Message spans are fire-and-forget**

Inter-agent messages create instant spans (opened and immediately closed). They don't have a lifecycle to track — the message is sent and that's the event.

**6. Span attribute limits**

Summaries are capped at 200 chars, results at 500 chars. This prevents large agent outputs from bloating trace storage.

### Instrumented Code Points

| File | What's traced |
|------|---------------|
| `src/main/services/task-manager.ts` | `createTask()`, `claimTask()`, `completeTask()` |
| `src/main/api/routes/agent-reports.ts` | `POST /api/v1/agent-report` handler |
| `src/main/services/master-agent.ts` | `addMessage()` (private, called by all message methods) |
| `src/main/index.ts` | `initTracing()` on startup, `shutdownTracing()` on quit |

### Span Attributes Reference

**Task spans** (`task.*`):

| Attribute | Type | Description |
|-----------|------|-------------|
| `task.id` | string | Task ID (e.g., `task-KpMqk4kT`) |
| `task.title` | string | Task title |
| `task.created_by` | string | Who created the task |
| `task.assigned_to` | string | Agent assigned to the task |
| `task.status` | string | `pending`, `in_progress`, `completed` |
| `task.completed_by` | string | Agent that completed the task |
| `task.result` | string | Task result (truncated to 500 chars) |

**Agent spans** (`agent.*`):

| Attribute | Type | Description |
|-----------|------|-------------|
| `agent.name` | string | Agent name (e.g., `ProjectManager`) |
| `agent.status` | string | `working`, `done`, `question`, `blocked`, `error` |
| `agent.summary` | string | Status summary (truncated to 200 chars) |

**Message spans** (`agent.message`):

| Attribute | Type | Description |
|-----------|------|-------------|
| `message.from` | string | Sender agent name |
| `message.to` | string | Recipient agent name |
| `message.body_preview` | string | Message preview (truncated to 200 chars) |

---

## Usage

### Prerequisites

- Docker installed
- iDashboard with experimental mode enabled

### 1. Start Phoenix

```bash
# Quick start (SQLite storage, ephemeral)
docker run -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest

# Production (PostgreSQL, persistent)
docker run -p 6006:6006 -p 4317:4317 \
  -e PHOENIX_SQL_DATABASE_URL=postgresql://user:pass@host:5432/phoenix \
  arizephoenix/phoenix:latest
```

Verify: open http://localhost:6006 — you should see the Phoenix UI.

### 2. Enable in iDashboard

Add to `~/.idashboard/config.yaml`:

```yaml
experimental:
  enabled: true
  phoenixEnabled: true
  phoenixUrl: "http://localhost:6006"
```

Restart iDashboard (`npm run dev` or relaunch the app).

Check logs for: `[Tracing] Phoenix tracing initialized, collector: http://localhost:6006`

### 3. Run a Multi-Agent Workflow

Spawn agents and assign a task to ProjectManager (via UI or REST API). As agents work, traces are sent to Phoenix automatically.

### 4. View Traces

Open http://localhost:6006 in your browser:

- **Traces tab** — Shows all traces with timing, status, and span tree
- **Agent Graph tab** — Visual node diagram of agent interactions
- **Sessions tab** — Group related traces by session ID (future enhancement)

### Example: What a Trace Looks Like

For a workflow where PM delegates to Architect, then Implementer:

```
Trace: task-KpMqk4kT "Add Cmd+K command palette"
│
├── task.created          0ms    [PM, pending]
├── task.claimed          50ms   [PM, in_progress]
├── agent.working         100ms  [PM: "Analyzing task and checking team"]
├── agent.message         2s     [PM → Architect: "Design the overlay"]
│
├── task.created          3s     [sub-task for Architect]
│   ├── task.dispatched   3.1s   [Architect]
│   ├── agent.working     3.5s   [Architect: "Analyzing codebase"]
│   ├── agent.done        25s    [Architect: "Design complete"]
│   └── task.completed    25s    [result: "Use Zustand + overlay..."]
│
├── task.created          26s    [sub-task for Implementer]
│   ├── task.dispatched   26.1s  [Implementer]
│   ├── agent.working     26.5s  [Implementer: "Building component"]
│   ├── agent.done        60s    [Implementer: "CommandPalette.tsx created"]
│   └── task.completed    60s    [result: "4 files changed..."]
│
├── agent.done            62s    [PM: "All sub-tasks complete"]
└── task.completed        62s    [result: "Feature implemented by team"]
```

---

## Testing

### Unit Tests

**File**: `tests/unit/services/tracing.test.ts` (14 tests)

Tests mock both `@arizeai/phoenix-otel` and `@opentelemetry/api` using `vi.hoisted()` to handle Vitest's mock hoisting. Key test categories:

- Initialization (success, failure, custom project name)
- Task lifecycle (create, claim, dispatch, complete)
- Agent reports (working → done, working → error, standalone done)
- Messages
- Shutdown (cleans up lingering spans)

Run:
```bash
npm test -- tests/unit/services/tracing.test.ts
```

### Integration Testing

To test with a real Phoenix instance:

1. Start Phoenix: `docker run -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest`
2. Enable in config
3. Start iDashboard
4. Spawn agents and create tasks
5. Open http://localhost:6006 — traces should appear within seconds

---

## Future Enhancements

### Session Tracking

Group related traces into sessions (e.g., one session per project task). Add `session_id` to the OTEL context when a top-level task is created, propagate to all child spans.

### Token Cost Tracking

When agents report via `/api/v1/agent-report`, include token usage in the span attributes. Phoenix can then show cumulative cost per task.

```typescript
// Future: agent report includes token metrics
span.setAttribute('llm.token_count.prompt', promptTokens);
span.setAttribute('llm.token_count.completion', completionTokens);
span.setAttribute('llm.token_count.total', totalTokens);
```

### LLM Call Instrumentation

Add `@arizeai/openinference-instrumentation-anthropic` to auto-instrument Anthropic SDK calls within agents. This would capture individual LLM calls (prompt, response, model, latency) inside each agent's work span.

### Evaluation Integration

Use Phoenix's evaluation API to score agent outputs:
- Was the Architect's design complete?
- Did the Implementer follow the design?
- Did the Reviewer catch real issues?

### Dashboard Integration

Add a "Traces" link in iDashboard's UI that opens the Phoenix web interface. Or embed key metrics (average task time, error rate) directly in the Orchestrator panel.

### OpenTelemetry Backend Swap

Since the integration uses standard OTEL spans, switching backends requires only changing the exporter:

```typescript
// To use Jaeger instead of Phoenix:
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
// Configure the exporter with Jaeger's endpoint instead of Phoenix
```

No changes to the instrumentation code.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No traces in Phoenix UI | Phoenix not running | Run `docker run -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest` |
| `[Tracing] Failed to initialize` in logs | Wrong URL or Phoenix unreachable | Check `phoenixUrl` in config, verify `curl http://localhost:6006` works |
| Traces appear but no agent graph | Need enough spans | Agent Graph needs multiple connected spans; run a full delegation workflow |
| App startup slower with tracing | OTEL SDK initialization | Normal (~200ms). Disable `phoenixEnabled` when not needed |
| Spans missing after app crash | Spans not flushed | `shutdownTracing()` runs on `before-quit`; hard crashes lose unflushed spans |

## References

- [Arize Phoenix GitHub](https://github.com/Arize-ai/phoenix) — 9k+ stars, 2.5M+ monthly downloads
- [Phoenix Documentation](https://arize.com/docs/phoenix)
- [Phoenix TypeScript Setup](https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/javascript)
- [Phoenix Docker Deployment](https://arize.com/docs/phoenix/self-hosting/deployment-options/docker)
- [OpenTelemetry Concepts](https://opentelemetry.io/docs/concepts/)
- [OpenInference Semantic Conventions](https://github.com/Arize-ai/openinference)
- [Phoenix REST API](https://arize.com/docs/phoenix/sdk-api-reference/rest-api/overview)
