# Agent Reporting Protocol & PM Auto-Spawn — Architecture

## Overview

iDashboard's agent orchestration system spawns Claude Code instances in iTerm2 tabs and monitors their progress through two complementary reporting paths. A Project Manager agent auto-spawns on startup to receive detailed reports from all other agents.

> **Note:** All agent features are gated behind `config.experimental.enabled = true` in Settings > Experimental.

---

## System Architecture

```mermaid
graph TB
    subgraph SPAWN["Agent Spawn Flow"]
        direction TB
        IDash["iDashboard Main Process"]
        PM["ProjectManager<br/>(auto-spawned)"]
        A1["Agent: Frontend"]
        A2["Agent: Backend"]

        IDash -->|"spawnAgent()"| PM
        IDash -->|"spawnAgent()"| A1
        IDash -->|"spawnAgent()"| A2
    end

    subgraph ITERM["iTerm2"]
        direction TB
        T0["Tab: ProjectManager<br/>sessionId: ABC-123"]
        T1["Tab: Frontend<br/>sessionId: DEF-456"]
        T2["Tab: Backend<br/>sessionId: GHI-789"]
    end

    subgraph REPORT["Reporting Paths"]
        direction TB
        P1["PATH 1: Explicit curl<br/>POST /api/v1/agent-report"]
        P2["PATH 2: Hook events<br/>POST /api/v1/events"]
    end

    subgraph CORE["iDashboard Core"]
        direction TB
        AR["AgentRegistry<br/>(in-memory)"]
        ALS["AgentLifecycleService<br/>(sessionMap)"]
        MAS["MasterAgentService"]
    end

    subgraph UI["Renderer"]
        OP["OrchestratorPanel<br/>Agent Cards + Badges"]
    end

    PM --> T0
    A1 --> T1
    A2 --> T2

    T1 -->|"agent calls curl"| P1
    T1 -->|"claude-bridge.py hook"| P2
    T2 -->|"agent calls curl"| P1
    T2 -->|"claude-bridge.py hook"| P2

    P1 -->|"findByName()"| AR
    P2 -->|"findAgentByTerminalId()"| ALS
    ALS -->|"agentId"| AR

    AR -->|"agent:updated"| UI
    AR -->|"longSummary routing"| MAS
    MAS -->|"routeTask(pmAgentId)"| T0

    style PM fill:#f59e0b,color:#000
    style P1 fill:#22c55e,color:#fff
    style P2 fill:#3b82f6,color:#fff
    style AR fill:#8b5cf6,color:#fff
```

---

## Dual Reporting Paths

The system uses two independent paths to track agent status. This redundancy ensures visibility even if an agent doesn't follow the preamble instructions.

```mermaid
sequenceDiagram
    participant Agent as Spawned Agent<br/>(Claude Code)
    participant Bridge as claude-bridge.py<br/>(Hook Script)
    participant Events as POST /api/v1/events
    participant Report as POST /api/v1/agent-report
    participant Lifecycle as AgentLifecycleService
    participant Registry as AgentRegistry
    participant Renderer as OrchestratorPanel

    Note over Agent: PATH 1 — Explicit Report (preamble-instructed)
    Agent->>Report: curl POST {agentName, status, shortSummary}
    Report->>Registry: findByName(agentName)
    Registry-->>Report: agentId
    Report->>Registry: updateReport(agentId, status, summary)
    Registry->>Renderer: agent:updated → IPC push

    Note over Agent: PATH 2 — Automatic from Hook Events
    Agent->>Bridge: Claude Stop hook fires (stdin JSON)
    Bridge->>Events: POST {connector, event, metadata.itermSessionId}
    Events->>Lifecycle: findAgentByTerminalId(itermSessionId)
    Lifecycle-->>Events: agentId (matched via sessionMap)
    Events->>Registry: updateReport(agentId, "done", summary)
    Registry->>Renderer: agent:updated → IPC push
```

### Path 1: Explicit Report (Agent-Driven)

The agent's preamble instructs it to POST status reports via `curl`:

```
POST http://127.0.0.1:{PORT}/api/v1/agent-report
Content-Type: application/json

{
  "agentName": "Frontend",
  "status": "working",
  "shortSummary": "Building login page",
  "longSummary": "Implemented form validation, OAuth buttons..."
}
```

**Advantages:** Agent controls timing and content. `longSummary` gets routed to PM.
**Limitation:** Relies on the agent actually executing the curl command.

### Path 2: Automatic Hook Events (System-Driven)

Claude Code's hook system (`~/.claude/settings.json`) fires for ALL Claude instances. The `claude-bridge.py` script captures these and POSTs to `/api/v1/events` with the `ITERM_SESSION_ID` environment variable in metadata.

The main process matches the session ID to a spawned agent:

```
ITERM_SESSION_ID = "w0t3p0:ABC-DEF-123"
                          └─── GUID ───┘
                                ↓
sessionMap: { "agent-001" → { sessionId: "ABC-DEF-123" } }
                                ↓
                         Match found → auto-update
```

**Event-to-Status Mapping:**

| Hook Event | Report Status | Summary |
|---|---|---|
| `needs-input` / `notification` | `question` | "Waiting for input" |
| `output-stop` / `stop` | `done` | First 120 chars of output |
| `output-subagent-stop` | `working` | "Subagent finished" |
| `output-tool-use` | `working` | "Using {toolName}" |
| `user-prompt` | `working` | "Received new prompt" |

**Advantages:** Zero-effort, always works, real-time.
**Limitation:** Summary text is generic (inferred, not authored by agent).

---

## PM Agent Auto-Spawn

```mermaid
flowchart LR
    Boot["App Bootstrap"] --> Check{"experimental<br/>enabled?"}
    Check -->|No| Skip["Skip agent setup"]
    Check -->|Yes| Init["Init AgentRegistry<br/>+ LifecycleService<br/>+ MasterAgentService"]
    Init --> Spawn["spawnAgent({<br/>name: 'ProjectManager',<br/>profile: orchestrator.md<br/>})"]
    Spawn --> Tab["iTerm2 Tab Created<br/>with preamble + profile"]
    Spawn --> Store["pmAgentId stored<br/>in API context"]

    Store --> Route["Incoming longSummary<br/>or auto-reports"]
    Route --> PM["masterAgent.routeTask(<br/>pmAgentId, report)"]
    PM --> Tab
```

The ProjectManager agent:
- Auto-spawns on app startup (if experimental mode is on)
- Receives the preamble + the `orchestrator.md` profile
- Gets `longSummary` reports from other agents via `masterAgent.routeTask()`
- Gets auto-reports when agents finish work (status=`done`)

---

## Notification Flow

```mermaid
flowchart TD
    Report["Agent reports<br/>status = question | blocked"]
    Report --> Surface["surfaceNotification()"]
    Surface --> Show["windowManager.surfaceForNotification()"]
    Surface --> Nav["pushToRenderer → navigate to Orchestrator"]
    Surface --> Sound["soundService.play()"]
    Show --> Window["iDashboard window<br/>brought to foreground"]
```

When any agent reports `question` or `blocked` (via either path), the app:
1. Brings the window to the foreground
2. Navigates to the Orchestrator panel
3. Plays the notification sound

---

## Agent Card UI

Each agent card in the Orchestrator shows:

```
┌──────────────────────────┐
│ ● Frontend               │  ← connection status dot (green/yellow/red/gray)
│ online  [working]        │  ← AgentStatus + AgentReportStatus badge
│ Building login page      │  ← shortSummary (truncated)
│ 12s ago                  │  ← time since last report
└──────────────────────────┘
```

**Report Status Badge Colors:**

| Status | Color | Meaning |
|---|---|---|
| `working` | Green | Actively making progress |
| `done` | Dark green | Task completed |
| `question` | Yellow | Needs human input |
| `blocked` | Red | Cannot proceed |
| `error` | Dark red | Hit an error |

---

## Data Flow Summary

```mermaid
graph LR
    subgraph Types
        ARS["AgentReportStatus<br/>working | done | question<br/>blocked | error"]
        ARR["AgentReportRequest<br/>{agentName, status,<br/>shortSummary, longSummary}"]
        AI["AgentInfo<br/>{...existing fields,<br/>reportStatus, shortSummary,<br/>lastReportAt}"]
    end

    subgraph Services
        REG["AgentRegistry<br/>findByName()<br/>updateReport()"]
        ALC["AgentLifecycleService<br/>loadPreamble()<br/>spawnAgent()<br/>findAgentByTerminalId()"]
        MAS["MasterAgentService<br/>routeTask()"]
    end

    subgraph API
        R1["/api/v1/agent-report"]
        R2["/api/v1/events"]
    end

    ARR --> R1
    R1 --> REG
    R2 --> ALC
    ALC --> REG
    REG --> AI
    REG --> MAS
    ARS --> AI
    ARS --> ARR
```

---

## Key Files

| File | Role |
|---|---|
| `src/shared/types.ts` | `AgentReportStatus`, `AgentReportRequest`, extended `AgentInfo` |
| `src/main/services/agent-registry.ts` | `findByName()`, `updateReport()` |
| `src/main/services/agent-lifecycle.ts` | `loadPreamble()`, `findAgentByTerminalId()`, `apiPort` |
| `src/main/api/routes/agent-reports.ts` | `POST /api/v1/agent-report` route |
| `src/main/api/server.ts` | Extended `APIContext` with agent fields |
| `src/main/index.ts` | Auto-update matching, PM spawn, `setupDefaultPreambles()` |
| `src/renderer/components/panels/OrchestratorPanel.tsx` | Report status badges, shortSummary display |
| `resources/preambles/agent-preamble.md` | Preamble template with `{{AGENT_NAME}}` / `{{PORT}}` |
| `resources/hooks/claude-bridge.py` | Hook script sending `itermSessionId` metadata |

---

## Future Consideration: CLI-First Architecture

The current implementation is tightly coupled to the Electron app's main process. A CLI-first approach would:

- Extract `AgentRegistry`, `AgentLifecycleService`, and the reporting API into a standalone daemon
- Let the Electron UI be a thin client connecting via WebSocket
- Enable headless operation, scripting, and CI/CD integration
- Make testing and development faster (no Electron rebuild cycle)

```mermaid
graph TB
    subgraph Future["CLI-First Architecture"]
        CLI["idash CLI daemon<br/>(Node.js process)"]
        API["REST + WebSocket API"]
        UI["Electron UI<br/>(thin client)"]
        TUI["Terminal UI<br/>(optional)"]
        Script["Scripts / CI"]

        CLI --> API
        API --> UI
        API --> TUI
        API --> Script
    end

    subgraph Current["Current Architecture"]
        Electron["Electron Main Process<br/>(everything bundled)"]
        Renderer["Renderer"]
        Electron --> Renderer
    end
```

This would decouple the agent orchestration logic from the UI framework, making each layer independently testable and deployable.
