# iDashboard - Comprehensive Application Plan

## 1. Vision & Problem Statement

**iDashboard** is a lightweight, always-accessible desktop dashboard that acts as a unified nerve center for developer tooling. It solves two core problems:

1. **Passive monitoring** - Aggregating status/data from multiple DevOps and development tools (OctopusDeploy, Graylog, TeamCity, etc.) into a single glanceable view.
2. **Active attention routing** - Tools like Claude Code, Cursor, and long-running processes can *push* notifications to the dashboard when they need human attention, eliminating the need to constantly poll terminal tabs.

### Core Requirements

- **Free-form resizable window** - Continuously resizable from any small size up to fullscreen. No preset size tiers — the UI adapts fluidly to whatever dimensions the user drags to.
- **Dockable to screen edges/corners** - The window can snap/dock to any screen border or corner, staying anchored there.
- **Temporary always-on-top** - When a notification arrives, the window surfaces as always-on-top for a configurable duration (default: 30 seconds), then auto-hides. The duration, hide behavior, and flash count are all configurable.
- **Everything configurable via config file** - Window size, position, dock location, always-on-top duration, hide delay, flash count, notification sounds, connector settings — nothing is hardcoded. All behavior is driven by a human-editable YAML config file.
- **Highly flexible connector system** - Adding a new data source connector must be straightforward. Connectors are self-contained modules with a simple interface. A generic HTTP connector covers arbitrary REST APIs without writing code.
- **macOS-first** - Primary target is macOS. Linux/Windows support is a future goal.

---

## 1.5 Why Not Existing Mac Tools?

macOS has several tools in the overlay/widget space. None fully satisfy the requirements:

| Tool | What It Does | Why It Falls Short |
|------|-------------|-------------------|
| **macOS Notification Center / Widgets** | Built-in desktop widgets (Sonoma+) | No always-on-top, no docking, no REST API polling, not freely resizable, no custom notification behavior |
| **Übersicht** | HTML/CSS/JS widgets rendered on desktop | Renders *behind* all windows (desktop layer) — no overlay, no always-on-top. Great for wallpaper-level info, wrong for attention routing |
| **Hammerspoon** | Lua scripting for macOS automation. Can create webview windows, poll HTTP APIs, set always-on-top | Closest match, but building a full dashboard in Lua webviews = reinventing the wheel with significantly worse DX. No hot reload, no component model, no npm ecosystem |
| **SwiftBar / xbar** | Menu bar plugins (scriptable, run any script and render output in menu bar) | Limited to menu bar dropdown. No overlay window, no resize, no dock, no rich UI |
| **BetterTouchTool** | Floating web views with always-on-top | Paid ($22). Building on someone else's platform. Limited auto-hide/dock control, no config-file-driven setup, no connector abstraction |
| **GeekTool** | Desktop-level widgets | Behind all windows (like Übersicht but older), not actively maintained |

**Verdict:** Building a custom app is warranted. The unique combination of dockable + temporary always-on-top + free-form resize + configurable REST connectors + config-file-driven behavior doesn't exist in any single tool. Hammerspoon comes closest but would require building the same app with worse tooling (no React, no TypeScript, no component model, no packaging, primitive debugging).

**Practical use of existing tools alongside iDashboard:**

- **Hammerspoon as rapid prototype (optional):** Before the full Electron build, the core UX (docking, auto-hide timing, overlay behavior) could be validated with a ~150-line Hammerspoon `hs.webview` + `hs.httpserver` prototype in 1-2 days. This lets you iterate on window behavior before committing to the full implementation.
- **SwiftBar as menu bar complement:** Even after building iDashboard, a tiny SwiftBar script that shows aggregate status (green/yellow/red dot) in the macOS menu bar is a useful "at-a-glance" indicator when the main dashboard is hidden. ~30 minute addition.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     iDashboard App                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Local API   │  │  Connector   │  │   UI Engine   │  │
│  │  Server      │  │  Engine      │  │   (Adaptive)  │  │
│  │  (HTTP+WS)   │  │  (Pull)      │  │               │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                   │          │
│         └────────┬────────┘                   │          │
│                  ▼                            │          │
│         ┌────────────────┐                    │          │
│         │  Event Bus /   │◄───────────────────┘          │
│         │  State Store   │                               │
│         └────────────────┘                               │
└─────────────────────────────────────────────────────────┘
         ▲                    ▲
         │ Push (HTTP/WS)     │ Pull (REST polling)
         │                    │
   ┌─────┴─────┐    ┌────────┴────────────┐
   │ Claude Code│    │ OctopusDeploy       │
   │ Hook       │    │ Graylog             │
   │ Scripts    │    │ TeamCity             │
   │ Custom CLI │    │ Custom connectors   │
   └────────────┘    └─────────────────────┘
```

### Two Data Flow Directions

| Direction | Mechanism | Example |
|-----------|-----------|---------|
| **Pull** (iDashboard initiates) | Connectors poll external APIs on configurable intervals | TeamCity build status every 30s |
| **Push** (external tool initiates) | Local HTTP API + WebSocket server accepts inbound events | Claude Code hook sends "needs input" event |

---

## 3. Technology Stack

### 3.1 Desktop Shell: **Electron**

**Decision rationale:** While Tauri offers better memory/startup performance, Electron is the pragmatic choice for this project because:

- The local HTTP API server is trivial with Node.js (Express/Fastify) - no Rust required
- The connector engine needs to make many HTTP requests to diverse APIs - Node.js ecosystem has mature clients for all target services
- Overlay/always-on-top/transparent window support is battle-tested in Electron
- System tray integration is mature and well-documented
- The entire app is JavaScript/TypeScript end-to-end, reducing cognitive overhead
- Memory overhead (150-300MB) is acceptable for a developer workstation tool

**Mitigation for Electron downsides:**
- Use `BrowserWindow` options to minimize Chromium overhead (`nodeIntegration: false`, context isolation)
- Lazy-load connector modules
- Single-window architecture with internal routing (no multi-window Chromium instances)

### 3.2 Frontend Framework: **React + Zustand + CSS Container Queries**

| Choice | Why |
|--------|-----|
| **React 19** | Dominant ecosystem, best library support for grid layouts (`react-grid-layout`), signals-like reactivity via `useSyncExternalStore` |
| **Zustand** | Lightweight state management, perfect for reactive store that both UI and connector engine write to |
| **react-grid-layout** | Draggable, resizable widget grid with breakpoint support - exactly what the adaptive UI needs |
| **CSS Container Queries** | Widgets adapt to their *own* size, not viewport. Critical for 200px vs fullscreen behavior |
| **Tailwind CSS** | Rapid styling with good dark mode support |

### 3.3 Backend (Main Process): **Node.js + Fastify**

| Component | Technology |
|-----------|------------|
| Local HTTP API | Fastify (lightweight, schema validation, fast) |
| WebSocket server | `ws` library via Fastify plugin |
| Connector scheduling | `node-cron` or custom interval manager |
| IPC (main↔renderer) | Electron IPC with typed channels |
| Configuration | YAML files (`js-yaml`) for human-editable connector configs |

### 3.4 Local Storage: **better-sqlite3 + Drizzle ORM**

**Decision rationale:** Evaluated 6 options — better-sqlite3 is the clear winner for this use case.

| Option | Verdict | Why Not |
|--------|---------|---------|
| **better-sqlite3** | **CHOSEN** | Fast sync API (30-40k inserts/sec), WAL mode, mature Electron support, Drizzle ORM type safety |
| sql.js (WASM) | Rejected | Entire DB must fit in memory, 3-5x slower than native, sql.js docs explicitly recommend against Electron use |
| LevelDB / RocksDB | Rejected | Key-value only — no SQL queries for time-series aggregation. Same native-module packaging pain as SQLite, none of the query power |
| NeDB / LokiJS | Rejected | **Both abandoned** (NeDB: 2016, LokiJS: unmaintained). In-memory with JSON persistence can't handle 50k events/day |
| DuckDB | Rejected | 8-10x slower single-row inserts, 30-50MB binary (vs 2-4MB SQLite), Node.js API still in transition |
| Flat files / electron-store | Rejected | No query engine. Fine for preferences, not for time-series data |

**Complementary storage:**

| Data Type | Storage | Rationale |
|-----------|---------|-----------|
| Time-series events, connector state, aggregates | **better-sqlite3** (SQLite WAL) | Fast inserts, indexed range queries, SQL aggregations |
| API tokens / secrets | **Electron safeStorage** | OS-level encryption via macOS Keychain |
| User preferences (non-sensitive) | **electron-store** | Simple JSON, follows OS conventions |

**Key configuration for performance:**

```sql
PRAGMA journal_mode = WAL;          -- Concurrent reads during writes
PRAGMA synchronous = NORMAL;        -- Safe with WAL, much faster than FULL
PRAGMA cache_size = -64000;         -- 64MB cache for hot index pages
PRAGMA mmap_size = 268435456;       -- 256MB memory-mapped I/O
PRAGMA foreign_keys = ON;
```

### 3.5 Network Reachability: **Layered Detection**

Network reachability uses a 5-layer detection strategy, from cheapest to most authoritative:

| Layer | Mechanism | Detects | Latency | When Used |
|-------|-----------|---------|---------|-----------|
| **L0: Interface** | `Electron net.isOnline()` + events | Wi-Fi off, cable unplugged | 0ms (event-driven) | Always — gate for all polling |
| **L1: VPN Heuristic** | `os.networkInterfaces()` → utun/tun detection | VPN connected/disconnected | <1ms | Every 30s + on network change |
| **L2: DNS** | `dns.resolve()` per hostname | DNS failure, split-tunnel VPN issues | 1-50ms | Before HTTP, on-demand |
| **L3: HTTP Health** | Actual `poll()` call or `HEAD /health` | Application-layer failures, auth issues | 50-500ms | Normal polling cycle |
| **L4: Health Tracking** | Circuit breaker + exponential backoff | Aggregate per-connector health | N/A (meta) | Always — wraps L0-L3 |

No native macOS addons required — `os.networkInterfaces()` + DNS resolution provides sufficient VPN detection without Objective-C++.

### 3.6 Build & Dev Tooling

| Tool | Purpose |
|------|---------|
| **Vite** | Frontend bundling (fast HMR, Electron-compatible via `electron-vite`) |
| **electron-builder** | Packaging and distribution |
| **TypeScript** | End-to-end type safety |
| **Vitest** | Unit testing |
| **Playwright** | E2E testing for Electron |
| **ESLint + Prettier** | Code quality |
| **Drizzle ORM + drizzle-kit** | Type-safe SQLite queries + schema migrations |
| **@electron/rebuild** | Native module (better-sqlite3) compilation for Electron |

---

## 4. Core Systems Design

### 4.1 Connector Engine

The connector engine is the heart of the data collection system. **Connectors must be easy to add.** Each connector is a self-contained module that knows how to talk to one external system. Adding a new connector means:

1. **For code-based connectors:** Create a single TypeScript file implementing the `Connector` interface, drop it in `src/main/connectors/`, and add a YAML config file. No changes to core code required.
2. **For config-only connectors:** Use the Generic HTTP connector — just write a YAML file describing the URL, auth, polling interval, and response mapping. Zero code.
3. **For push-based connectors:** Any script/tool can POST JSON to the local API. No connector code needed at all.

The engine auto-discovers connector files at startup and hot-reloads new connector configs added to `~/.idashboard/connectors/` without restart.

#### Connector Interface

```typescript
interface ConnectorConfig {
  id: string;                    // unique instance ID, e.g. "teamcity-prod"
  type: string;                  // connector type, e.g. "teamcity"
  displayName: string;           // human label
  enabled: boolean;
  pollIntervalMs: number;        // 0 = push-only, no polling
  auth: AuthConfig;              // type-specific auth (apiKey, basic, token, oauth)
  settings: Record<string, unknown>; // connector-specific settings
  ui: WidgetUIConfig;            // how this connector's data renders
}

interface Connector {
  readonly type: string;
  readonly capabilities: ('pull' | 'push' | 'action')[];

  // Lifecycle
  initialize(config: ConnectorConfig): Promise<void>;
  destroy(): Promise<void>;

  // Pull: iDashboard fetches data
  poll(): Promise<ConnectorEvent[]>;

  // Push: validate + normalize inbound events from local API
  normalizeInbound?(rawEvent: unknown): ConnectorEvent;

  // Actions: things the user can trigger FROM the dashboard
  getActions?(): ConnectorAction[];
  executeAction?(actionId: string, params?: unknown): Promise<void>;
}

interface ConnectorEvent {
  connectorId: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical' | 'attention';
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  uiHints?: {
    icon?: string;
    color?: string;
    blinkDurationMs?: number;   // e.g. 30000 for the Claude Code blink scenario
    actionButtons?: ActionButton[];
    badge?: string | number;
  };
}
```

#### Built-in Connectors (Phase 1)

##### 4.1.1 Claude Code Connector

**The pressing use case.** This connector works via **push** from Claude Code hooks.

**How it works:**

1. iDashboard starts a local HTTP API (e.g., `http://localhost:19280/api/v1/events`)
2. User configures a Claude Code **Notification hook** in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [
      {
        "type": "command",
        "command": "curl -s -X POST http://localhost:19280/api/v1/events -H 'Content-Type: application/json' -d '{\"connector\": \"claude-code\", \"event\": \"needs-input\", \"session\": \"'\"$CLAUDE_SESSION_ID\"'\", \"message\": \"'\"$(echo $HOOK_PAYLOAD | jq -r .message)\"'\"}'"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "curl -s -X POST http://localhost:19280/api/v1/events -H 'Content-Type: application/json' -d '{\"connector\": \"claude-code\", \"event\": \"task-complete\", \"session\": \"'\"$CLAUDE_SESSION_ID\"'\"}'"
      }
    ]
  }
}
```

3. When Claude Code needs input, the Notification hook fires → hits iDashboard API
4. iDashboard shows a blinking button: **"Claude Code: <tab/session name>"** that blinks for a configurable duration (default 30s)
5. When the user clicks the button, iDashboard can:
   - Simply dismiss the notification (acknowledge)
   - Focus/raise the terminal window (via shell command)
   - Execute a configured response action

**Widget behavior at different sizes (fluid, not tier-locked):**
| Available space | Display |
|----------------|---------|
| Very small (~100px) | Blinking Claude icon with attention color |
| Small (~150-250px) | `CC: session-name` blinking row with severity badge |
| Medium (~300-450px) | Full card with session name, message preview, action buttons |
| Large (500px+) | Card + full message + conversation context + quick-reply |

##### 4.1.2 OctopusDeploy Connector

**Direction:** Pull (polls Octopus REST API)

**Auth:** API Key via `X-Octopus-ApiKey` header

**Key endpoints polled:**
| Data | Endpoint | Interval |
|------|----------|----------|
| Dashboard overview | `GET /api/dashboard` | 30s |
| Deployment status | `GET /api/deployments?take=10` | 30s |
| Environment list | `GET /api/environments/all` | 5min |
| Release list | `GET /api/projects/{id}/releases` | 60s |
| Task progress | `GET /api/tasks/{id}/details` | 10s (active only) |

**Events generated:**
- `deployment-started` (info)
- `deployment-succeeded` (info)
- `deployment-failed` (critical)
- `deployment-queued` (info)
- `guided-failure` (attention) - needs human intervention

##### 4.1.3 TeamCity Connector

**Direction:** Pull (polls TeamCity REST API)

**Auth:** HTTP Basic Auth or Bearer Token via `/httpAuth/` prefix

**Key endpoints polled:**
| Data | Endpoint | Interval |
|------|----------|----------|
| Running builds | `GET /app/rest/builds?locator=running:true` | 15s |
| Queued builds | `GET /app/rest/buildQueue` | 30s |
| Recent failures | `GET /app/rest/builds?locator=status:FAILURE,count:10` | 30s |
| Agent status | `GET /app/rest/agents?locator=connected:true` | 60s |
| Build statistics | `GET /app/rest/builds/{id}/statistics` | on-demand |

**Events generated:**
- `build-started` (info)
- `build-succeeded` (info)
- `build-failed` (error)
- `build-hanging` (warning) - build exceeds estimated time
- `agent-disconnected` (warning)
- `queue-growing` (warning) - queue depth exceeds threshold

##### 4.1.4 Graylog Connector

**Direction:** Pull (polls Graylog REST API)

**Auth:** Access Token (recommended) or Basic Auth. Token used as username with literal password `token`.

**Key endpoints polled:**
| Data | Endpoint | Interval |
|------|----------|----------|
| Active alerts | `POST /api/events/search` | 30s |
| Stream status | `GET /streams` | 60s |
| Search (custom) | `POST /api/search/messages` | configurable |
| System health | `GET /api/system` | 60s |

**Events generated:**
- `alert-triggered` (error/critical based on severity)
- `alert-resolved` (info)
- `stream-disabled` (warning)
- `high-error-rate` (warning) - custom query threshold exceeded
- `ingestion-lag` (warning)

##### 4.1.5 Generic HTTP Connector

A configurable connector for any REST API not covered by dedicated connectors.

```yaml
connectors:
  - id: my-custom-api
    type: generic-http
    displayName: "Health Check"
    pollIntervalMs: 60000
    auth:
      type: bearer
      token: "${ENV_MY_API_TOKEN}"
    settings:
      url: "https://api.example.com/health"
      method: GET
      expectedStatus: 200
      extractTitle: "$.status"
      extractBody: "$.details"
      severityMapping:
        "healthy": "info"
        "degraded": "warning"
        "down": "critical"
```

##### 4.1.6 Generic Push Connector

Any external script/tool can push events via the local API without needing a dedicated connector:

```bash
curl -X POST http://localhost:19280/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "connector": "custom",
    "title": "Long build finished",
    "severity": "info",
    "uiHints": {
      "icon": "check-circle",
      "color": "#22c55e"
    }
  }'
```

---

### 4.2 Local API Server

The local API is the push-inbound interface. It runs in Electron's main process.

#### Endpoints

```
POST /api/v1/events                    # Push an event
GET  /api/v1/events?since={timestamp}  # List recent events
DELETE /api/v1/events/{id}             # Dismiss/acknowledge

POST /api/v1/actions/{connectorId}/{actionId}  # Trigger action

GET  /api/v1/connectors                # List connector statuses
GET  /api/v1/health                    # App health check

WS   /api/v1/ws                        # WebSocket for bidirectional real-time
```

#### WebSocket Protocol

Clients can subscribe to real-time event streams:

```json
// Client → Server: subscribe
{ "type": "subscribe", "connectors": ["claude-code", "teamcity"] }

// Server → Client: event
{ "type": "event", "data": { /* ConnectorEvent */ } }

// Client → Server: action
{ "type": "action", "connectorId": "claude-code", "actionId": "dismiss", "eventId": "evt_123" }
```

#### Security

- Binds to `127.0.0.1` only (localhost) - not exposed to network
- Optional bearer token for local API auth (configurable, default: no auth for localhost)
- Rate limiting to prevent abuse from runaway scripts

---

### 4.3 Event Bus & State Store

Central reactive state using Zustand in the renderer process, synchronized from the main process via Electron IPC.

```typescript
interface DashboardState {
  // Active events (not yet dismissed/expired)
  events: Map<string, ConnectorEvent>;

  // Connector health/status
  connectors: Map<string, ConnectorStatus>;

  // UI layout state
  layout: LayoutConfig;
  windowSize: { width: number; height: number };

  // Actions
  pushEvent: (event: ConnectorEvent) => void;
  dismissEvent: (eventId: string) => void;
  updateConnectorStatus: (id: string, status: ConnectorStatus) => void;
}
```

**Event lifecycle:**
1. Event arrives (push or pull) → added to store with TTL
2. UI renders immediately (reactive)
3. Event auto-expires after TTL or manual dismiss
4. Blinking/attention animations run for `uiHints.blinkDurationMs`
5. Historical events kept in rolling buffer (configurable, default 1000)

---

### 4.4 Adaptive UI System

**No preset size tiers.** The window is freely resizable to any dimensions the user wants. The UI adapts fluidly using CSS Container Queries and `ResizeObserver`, progressively revealing or collapsing content based on actual available space — not hardcoded breakpoints.

#### Continuous Fluid Sizing

Instead of tier-based rendering, each widget uses CSS `@container` queries to decide what to show:

```css
/* Widget adapts to its own container size, not the viewport */
@container widget (max-width: 120px) {
  /* Icon-only: just status dot + connector icon */
  .widget-title, .widget-body, .widget-actions { display: none; }
}

@container widget (min-width: 121px) and (max-width: 300px) {
  /* Compact: icon + short title + badge */
  .widget-body, .widget-actions { display: none; }
}

@container widget (min-width: 301px) {
  /* Full: everything visible */
}
```

The JavaScript layer uses `ResizeObserver` to track the window dimensions as a reactive signal and drives layout decisions that CSS alone can't handle (e.g., switching between a single-column list vs. a multi-column grid):

```typescript
// Reactive window size — no tiers, just raw dimensions
const windowSize = useWindowSize(); // { width: number, height: number }

// Layout decisions based on continuous dimensions
const columns = Math.max(1, Math.floor(windowSize.width / 280));
const showEventHistory = windowSize.height > 400;
const showActionLabels = windowSize.width > 350;
```

#### Widget Rendering at Different Sizes

The same widget progressively reveals content as space allows. Nothing is "tier-locked":

| Available space | What shows |
|----------------|-----------|
| Very small (~100-150px wide) | Status dot + connector icon only. Blinking icon for attention. |
| Small (~150-300px wide) | Icon + connector name + severity badge. Truncated status text. |
| Medium (~300-500px wide) | Full card: name, latest event, severity bar, icon-only action buttons. |
| Large (500px+ wide) | Full card + event history, action buttons with labels, charts if configured. |
| Fullscreen | Grid of full cards + event timeline sidebar + settings panel + drag/resize layout editor. |

These are not discrete breakpoints — they are **content-driven CSS container queries** that activate whenever the widget has enough space, regardless of window size.

#### Widget Configuration

Each connector defines its widget appearance. Visibility thresholds are configurable:

```yaml
connectors:
  - id: claude-code-main
    type: claude-code
    ui:
      icon: "terminal"           # icon name from icon set
      color: "#f97316"           # brand color
      priority: 1                # sort order (lower = higher)
      showBadge: true
      blinkOnAttention: true
      # Content visibility thresholds (px) — all configurable
      thresholds:
        showTitle: 150           # min container width to show title text
        showBody: 300            # min container width to show event body
        showActions: 250         # min container width to show action buttons
        showActionLabels: 350    # min width to show text labels on actions
        showHistory: 400         # min container height to show event history
        historyCount: 5          # number of past events to show
      customComponent: null      # or path to custom React component
```

#### Window Modes & Docking

iDashboard supports multiple window behaviors. The active mode, dock position, and all timing parameters are configurable via `config.yaml`.

| Mode | Behavior |
|------|----------|
| **Floating** | Draggable, freely resizable. Optional always-on-top. Semi-transparent background. |
| **Docked** | Snaps to a screen edge or corner (configurable: `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right`). Stays anchored when other windows move. |
| **Tray Popup** | Lives in system tray. Click tray icon → popup appears near tray. |
| **Fullscreen** | Regular maximized window with full feature set. |

#### Docking System

```typescript
interface DockConfig {
  position: 'top' | 'bottom' | 'left' | 'right'
            | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  offsetX: number;              // px offset from edge (default: 0)
  offsetY: number;              // px offset from edge (default: 0)
  autoHide: boolean;            // hide when no attention events (default: false)
  autoHideDelayMs: number;      // delay before hiding after last event dismissed (default: 5000)
}
```

Docking uses Electron's `setBounds()` API combined with `screen.getPrimaryDisplay().workAreaSize` to calculate anchor positions. The window resists being moved away from its dock position — the user can resize it freely but it stays anchored to the chosen edge/corner.

#### Temporary Always-on-Top Behavior

When a notification arrives, the window temporarily becomes always-on-top to grab attention, then reverts. All timing and behavior is configurable:

```yaml
# In config.yaml → window section
window:
  alwaysOnTop:
    permanent: false            # if true, window is always on top (ignores temporary behavior)
    onNotification:
      enabled: true             # surface window on notification arrival
      durationSec: 30           # seconds to stay on top (default: 30)
      flashCount: 3             # number of times the tray icon / window flashes (default: 3)
      flashIntervalMs: 500      # ms between flashes (default: 500)
      afterExpiry: "hide"       # what to do after duration: "hide" | "lower" | "minimize" | "stay"
                                #   hide: hide window entirely
                                #   lower: remove always-on-top but keep visible
                                #   minimize: minimize to tray
                                #   stay: keep visible but remove always-on-top
```

**Flow:**
1. Notification event arrives (e.g., Claude Code needs input)
2. Window surfaces as always-on-top (`BrowserWindow.setAlwaysOnTop(true)`)
3. Tray icon and/or window border flashes `flashCount` times
4. Attention animation runs for `durationSec` seconds
5. After expiry, the configured `afterExpiry` action executes
6. If the user interacts with the window before expiry, the timer resets or cancels (configurable)

---

### 4.5 Configuration System

**Everything is configurable via config files.** Nothing is hardcoded — window size, position, behavior, timing, flash counts, notification sounds, connector settings, UI thresholds — all driven by human-editable YAML. The app watches config files for changes and hot-reloads without restart.

#### Design Principles

1. **Config file is the source of truth** — every behavioral parameter has a corresponding config key
2. **Sensible defaults** — the app works out of the box with zero config; the user only overrides what they want
3. **Environment variable substitution** — secrets use `${ENV_VAR}` syntax, never stored in plaintext
4. **Hot-reload** — config file changes are detected via `fs.watch()` and applied without restart
5. **Schema-validated** — Zod schemas validate config on load, with clear error messages for invalid values

#### Directory Structure

```
~/.idashboard/
├── config.yaml              # Main app config (window, API, behavior, notifications)
├── connectors/
│   ├── claude-code.yaml     # One file per connector instance
│   ├── teamcity-prod.yaml
│   ├── octopus-prod.yaml
│   └── graylog-main.yaml
├── layouts/
│   ├── default.yaml         # Default widget layout
│   └── compact.yaml         # User-saved layouts
└── themes/
    └── custom.yaml          # Custom theme overrides
```

#### Main Config (`config.yaml`) — Complete Reference

Every key shown below is optional. Defaults are shown as values.

```yaml
# ─── Window Behavior ───────────────────────────────────────────────
window:
  defaultMode: floating           # floating | docked | tray | fullscreen
  size:
    width: 400                    # initial width in px (any positive integer)
    height: 300                   # initial height in px (any positive integer)
    minWidth: 80                  # minimum resize width
    minHeight: 60                 # minimum resize height
    rememberLastSize: true        # persist size across restarts
  position:
    x: null                       # initial x position (null = center of screen)
    y: null                       # initial y position (null = center of screen)
    rememberLastPosition: true    # persist position across restarts
  opacity: 0.95                   # window opacity 0.0-1.0 (floating/docked modes)
  frameless: true                 # hide native window frame (custom title bar)
  clickThrough: false             # allow clicks to pass through transparent areas
  theme: dark                     # dark | light | auto (follows OS)

  # Docking
  dock:
    position: null                # null (undocked) | top | bottom | left | right
                                  # | top-left | top-right | bottom-left | bottom-right
    offsetX: 0                    # px offset from dock edge
    offsetY: 0                    # px offset from dock edge
    autoHide: false               # auto-hide when no attention events
    autoHideDelayMs: 5000         # ms to wait after last event before hiding
    showOnHover: true             # reveal docked+hidden window on mouse hover at edge

  # Always-on-top behavior
  alwaysOnTop:
    permanent: false              # if true, always on top regardless of notifications
    onNotification:
      enabled: true               # surface window when notification arrives
      durationSec: 30             # seconds to stay on top after notification
      flashCount: 3               # number of flashes (tray icon + window border)
      flashIntervalMs: 500        # ms between flashes
      afterExpiry: "hide"         # hide | lower | minimize | stay
      cancelOnInteraction: true   # cancel timer if user clicks the window

# ─── Local API Server ──────────────────────────────────────────────
api:
  port: 19280                     # HTTP + WebSocket port
  bind: "127.0.0.1"              # bind address (127.0.0.1 = localhost only)
  auth:
    enabled: false                # require bearer token for API access
    token: "${ENV_IDASHBOARD_TOKEN}"
  rateLimit:
    maxRequestsPerMinute: 120     # rate limit for inbound events
    maxBurstSize: 20              # max burst before throttling

# ─── Event Behavior ────────────────────────────────────────────────
events:
  maxHistory: 1000                # max events kept in rolling buffer
  defaultTTLMs: 3600000           # default event time-to-live (1 hour)
  deduplication:
    enabled: true                 # deduplicate identical events within window
    windowMs: 5000                # dedup window in ms

# ─── Notification Behavior ─────────────────────────────────────────
notifications:
  sound:
    enabled: true                 # play sound on attention events
    file: null                    # custom sound file path (null = system default)
    volume: 0.7                   # sound volume 0.0-1.0
  nativeNotification: true        # also show macOS Notification Center notification
  trayIconBadge: true             # show unread count badge on tray icon

# ─── Storage ──────────────────────────────────────────────────────
storage:
  retentionDays: 30               # days to keep raw events (older events purged)
  aggregateRetentionDays: 90      # days to keep daily aggregates for trend charts
  vacuumIntervalHours: 168        # run VACUUM weekly (hours). 0 = never auto-vacuum
  maxDbSizeMB: 1024               # warn if DB exceeds this size (advisory, not enforced)

# ─── Network Reachability ─────────────────────────────────────────
network:
  vpnInterfaceCheckIntervalSec: 30  # how often to check os.networkInterfaces() for VPN
  dnsCheckTimeoutMs: 3000           # timeout for DNS resolve checks
  circuitBreaker:
    failureThreshold: 5             # consecutive failures before opening circuit
    halfOpenRetryMs: 30000          # ms before trying a real poll in half-open state
    maxBackoffMs: 300000            # max backoff interval (5 minutes)
    backoffJitter: 0.3              # +/- 30% random jitter on backoff

# ─── Startup ───────────────────────────────────────────────────────
startup:
  launchAtLogin: false            # register as login item
  startMinimized: true            # start in tray (not visible)
  checkForUpdates: true           # auto-update check on startup
```

#### Connector Config Example (`connectors/teamcity-prod.yaml`)

```yaml
id: teamcity-prod
type: teamcity
displayName: "TeamCity Production"
enabled: true
pollIntervalMs: 15000             # poll interval in ms (0 = push-only)

auth:
  type: bearer                    # apiKey | bearer | basic | none
  token: "${ENV_TC_TOKEN}"

settings:
  baseUrl: "https://teamcity.company.com"
  buildConfigs:                   # only monitor these build configs (empty = all)
    - "MyProject_Build"
    - "MyProject_Deploy"
  failureThreshold: 2             # alert after N consecutive failures
  queueDepthWarning: 5            # warn if queue exceeds this
  requiresVpn: true               # mark this connector as VPN-dependent (affects reachability UI)

ui:
  icon: "hammer"
  color: "#06b6d4"
  priority: 2                     # sort order (lower = higher priority)
  showBadge: true
  blinkOnAttention: true
  thresholds:                     # widget content visibility (px)
    showTitle: 150
    showBody: 300
    showActions: 250
    showActionLabels: 350
    showHistory: 400
    historyCount: 5
```

---

### 4.6 Data Persistence (SQLite)

All event data, connector state, and computed aggregates are stored in a single SQLite database file at `{userData}/idashboard.db`. The database uses WAL mode for concurrent read/write performance.

#### Database Schema (Drizzle ORM)

```typescript
// src/main/db/schema.ts
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// ─── Core Event Store ────────────────────────────────────────────────
// All time-series events: builds, deploys, CI results, alerts, push notifications
export const events = sqliteTable('events', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  timestamp:   integer('timestamp').notNull(),           // Unix epoch ms
  connectorId: text('connector_id').notNull(),           // source connector
  category:    text('category').notNull(),               // 'build' | 'deploy' | 'alert' | 'notification'
  eventType:   text('event_type').notNull(),             // 'build.succeeded' | 'deploy.failed' etc.
  severity:    text('severity').notNull(),               // 'info' | 'warning' | 'error' | 'critical' | 'attention'
  status:      text('status'),                           // 'success' | 'failure' | 'in_progress' | 'cancelled'
  durationMs:  integer('duration_ms'),                   // for builds, deploys
  title:       text('title').notNull(),                  // human-readable summary
  body:        text('body'),                             // detailed message
  metadata:    text('metadata', { mode: 'json' }),       // flexible JSON payload
  sourceUrl:   text('source_url'),                       // link to source system
  externalId:  text('external_id'),                      // dedupe key from source
  dismissed:   integer('dismissed', { mode: 'boolean' }).default(false),
  expiresAt:   integer('expires_at'),                    // auto-expire timestamp (null = no expiry)
}, (table) => [
  index('idx_events_connector_time').on(table.connectorId, table.timestamp),
  index('idx_events_severity_time').on(table.severity, table.timestamp),
  index('idx_events_category_status_time').on(table.category, table.status, table.timestamp),
  index('idx_events_external_id').on(table.externalId),
]);

// ─── Connector State ─────────────────────────────────────────────────
// Runtime state persisted across restarts: last poll cursor, error counts, health
export const connectorState = sqliteTable('connector_state', {
  connectorId:  text('connector_id').primaryKey(),
  lastPollAt:   integer('last_poll_at'),
  lastEventAt:  integer('last_event_at'),
  errorCount:   integer('error_count').default(0),
  lastError:    text('last_error'),
  healthStatus: text('health_status').default('healthy'), // 'healthy' | 'degraded' | 'error' | 'disabled'
  circuitState: text('circuit_state').default('closed'),  // 'closed' | 'open' | 'half-open'
  backoffMs:    integer('backoff_ms').default(0),
  pollState:    text('poll_state', { mode: 'json' }),     // connector-specific cursor/pagination
  updatedAt:    integer('updated_at'),
});

// ─── Daily Aggregates (Materialized for Trend Charts) ────────────────
// Pre-computed daily rollups. Query 30 rows instead of scanning 1.5M events.
export const dailyAggregates = sqliteTable('daily_aggregates', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  dayKey:        integer('day_key').notNull(),            // YYYYMMDD as integer
  connectorId:   text('connector_id').notNull(),
  category:      text('category').notNull(),
  eventType:     text('event_type').notNull(),
  totalCount:    integer('total_count').default(0),
  successCount:  integer('success_count').default(0),
  failureCount:  integer('failure_count').default(0),
  avgDurationMs: real('avg_duration_ms'),
  p95DurationMs: real('p95_duration_ms'),
  maxDurationMs: integer('max_duration_ms'),
}, (table) => [
  index('idx_daily_agg_connector_day').on(table.connectorId, table.dayKey),
  index('idx_daily_agg_category_type_day').on(table.category, table.eventType, table.dayKey),
]);

// ─── Key-Value Cache ─────────────────────────────────────────────────
// Dashboard layout cache, window position, misc persisted state
export const kvCache = sqliteTable('kv_cache', {
  key:       text('key').primaryKey(),
  value:     text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
  expiresAt: integer('expires_at'),                      // null = no expiry
});
```

#### Database Initialization

```typescript
// src/main/db/connection.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import * as schema from './schema';

export function createDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'idashboard.db');
  const sqlite = new Database(dbPath);

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('cache_size = -64000');       // 64MB
  sqlite.pragma('mmap_size = 268435456');     // 256MB
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite, { schema });
}
```

#### Data Retention & Maintenance

- **Daily job** (runs at app start + every 24h): purge raw events older than `storage.retentionDays` (default: 30)
- **Weekly job**: purge daily aggregates older than `storage.aggregateRetentionDays` (default: 90)
- **Weekly VACUUM**: reclaim disk space (configurable via `storage.vacuumIntervalHours`)
- **Aggregate rollup**: on each event insert, upsert into `dailyAggregates` for the current day. This means trend charts always query pre-computed rows (<1ms) instead of scanning raw events

#### Estimated Disk Usage

| Scale | Raw Events | With Indexes | Daily Aggregates |
|-------|-----------|--------------|-----------------|
| Light (5k events/day, 30 days) | ~50 MB | ~70 MB | ~5 KB |
| Medium (50k events/day, 30 days) | ~450 MB | ~600 MB | ~50 KB |
| Heavy (200k events/day, 30 days) | ~1.8 GB | ~2.4 GB | ~200 KB |

For the medium case (50k/day), keeping only 7 days of raw events + 30 days of aggregates drops storage to ~150 MB while preserving full trend visibility.

#### Schema Migrations

Drizzle Kit generates migration SQL files at build time (`drizzle-kit generate`). At app startup, the migration runner applies pending migrations sequentially. SQLite's limited `ALTER TABLE` means some migrations require the create-new-table → copy-data → drop-old → rename pattern, which Drizzle handles automatically.

---

### 4.7 Network Reachability & Health Monitoring

iDashboard must gracefully handle network failures — the user may be offline, on flaky Wi-Fi, or disconnected from VPN. The system uses a layered detection strategy that avoids hammering down endpoints and clearly communicates status to the user.

#### Layered Detection Architecture

```
Layer 0: Interface Check ──── net.isOnline() / events ────────── 0ms (push)
  │ If offline → pause ALL connectors, show "Offline" banner
  │
Layer 1: VPN Heuristic ────── os.networkInterfaces() ─────────── <1ms (poll 30s)
  │ If VPN interfaces disappeared → flag VPN-dependent connectors
  │
Layer 2: DNS Reachability ──── dns.resolve() per hostname ─────── 1-50ms (on-demand)
  │ If DNS fails → skip HTTP, report "dns-failed"
  │
Layer 3: HTTP Health ────────── Actual poll() / HEAD request ──── 50-500ms (normal cycle)
  │ This is what connectors already do — just track results
  │
Layer 4: Health Tracking ────── Circuit breaker + backoff ─────── meta-layer
    Aggregates L0-L3 into per-connector health state
    Manages exponential backoff, circuit state, retry timing
```

#### Types

```typescript
// Added to src/shared/types.ts

export type ReachabilityState =
  | 'online'              // All checks passing
  | 'degraded'            // Some connectors failing
  | 'vpn-disconnected'    // VPN interfaces missing, internal endpoints unreachable
  | 'offline';            // net.isOnline() === false

export type EndpointReachability =
  | 'reachable'           // Last poll succeeded
  | 'dns-failed'          // Can't resolve hostname
  | 'tcp-failed'          // Can't connect to host:port
  | 'http-failed'         // Connected but HTTP error (5xx, timeout)
  | 'auth-failed'         // 401/403 — credentials issue, not network
  | 'unknown';            // Not yet checked

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface ConnectorHealth {
  reachability: EndpointReachability;
  circuitState: CircuitState;
  consecutiveFailures: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
  currentBackoffMs: number;
  nextPollAt?: number;
  latencyMs?: number;          // last successful response time
  requiresVpn: boolean;        // from connector config
}
```

#### Circuit Breaker State Machine

```
           poll succeeds
  CLOSED ─────────────────► CLOSED (reset failures, reset backoff)
    │
    │ poll fails (failures < threshold)
    ▼
  CLOSED (increment failures, increase backoff)
    │
    │ failures >= threshold (default: 5)
    ▼
  OPEN ──── DNS probe ──── fails ──► OPEN (stay, increase backoff)
    │
    │ DNS probe succeeds
    ▼
  HALF-OPEN ──── real poll ──── fails ──► OPEN (longer backoff)
    │
    │ poll succeeds
    ▼
  CLOSED (reset everything, resume normal interval)
```

**Backoff formula:** `nextBackoff = min(current * 2, maxBackoffMs) * (1 ± jitter)`

Default: 5s → 10s → 20s → 40s → 80s → 160s → 300s (cap). Jitter ±30%.

#### VPN Detection

VPN detection uses `os.networkInterfaces()` to detect tunnel interfaces, without native macOS addons:

```typescript
function detectVpnInterfaces(): boolean {
  const interfaces = os.networkInterfaces();
  return Object.entries(interfaces).some(([name, addrs]) => {
    if (!addrs) return false;
    // utun* = macOS VPN, tun* = OpenVPN/WireGuard, ppp* = L2TP
    if (!/^(utun|tun|ppp|ipsec|tap)\d*$/.test(name)) return false;
    // Filter out macOS system utun (iCloud relay, Continuity) by checking for routable IPv4
    return addrs.some(a => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
  });
}
```

**Caveat:** Not all `utun` interfaces are VPNs (macOS uses them for iCloud relay). The heuristic filters by "has a routable IPv4 address" which catches most real VPNs. For connectors marked `requiresVpn: true`, a DNS resolve of the endpoint hostname provides the definitive check.

#### NetworkReachabilityService (Main Process)

```typescript
// src/main/services/network-reachability.ts
export class NetworkReachabilityService {
  private _isSystemOnline = true;
  private _vpnDetected = false;

  initialize(): void {
    // Layer 0: System online/offline (event-driven, instant)
    this._isSystemOnline = net.isOnline();
    net.on('online', () => { this._isSystemOnline = true; this.onNetworkChange(); });
    net.on('offline', () => { this._isSystemOnline = false; this.onNetworkChange(); });

    // Layer 1: VPN heuristic (poll every 30s — os.networkInterfaces() is <1ms)
    this.checkVpnInterfaces();
    setInterval(() => this.checkVpnInterfaces(), 30_000);
  }

  // Layer 2: DNS check for a specific hostname
  async checkDns(hostname: string, timeoutMs = 3000): Promise<boolean> {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      dns.resolve(hostname, err => { clearTimeout(timer); resolve(!err); });
    });
  }

  // Computed overall state
  getOverallState(connectorHealths: Map<string, ConnectorHealth>): ReachabilityState {
    if (!this._isSystemOnline) return 'offline';
    const vpnRequired = [...connectorHealths.values()].filter(h => h.requiresVpn);
    if (!this._vpnDetected && vpnRequired.some(h => h.reachability !== 'reachable'))
      return 'vpn-disconnected';
    if ([...connectorHealths.values()].some(h => h.circuitState === 'open'))
      return 'degraded';
    return 'online';
  }
}
```

#### UI Presentation

**Global status bar** (thin strip at top of dashboard):

| State | Visual | Behavior |
|-------|--------|----------|
| **Online** | Hidden — no bar shown | Don't show "online" status — it's visual noise |
| **Degraded** | Amber bar: "2 services unreachable" | Click to expand affected connectors |
| **VPN Disconnected** | Orange bar: "VPN required for TeamCity, Grafana" | Shows which connectors need VPN |
| **Offline** | Red bar: "Network disconnected — polling paused" | Cloud-off icon + text |

**Per-connector health indicator** (small dot on each widget):

| State | Visual | Tooltip |
|-------|--------|---------|
| Healthy | Green dot (or hidden) | "Last poll: 5s ago" |
| Backing off (1-4 failures) | Yellow dot | "Retrying in 20s (2 failures)" |
| Circuit open (5+ failures) | Red dot | "Unreachable — retrying in 2m" |
| VPN required | Orange dot | "VPN required — connect VPN to reach TeamCity" |
| Auth failed | Red key icon | "Authentication failed — check credentials" |

**Connector detail view** (expanded widget):
- Last successful poll time (relative: "2 min ago")
- Circuit state + consecutive failure count
- Next retry countdown
- Response latency (last N successful polls)
- Failure layer (DNS / HTTP / Auth) for targeted troubleshooting

**Tray icon** encodes aggregate status:
- Normal icon: all healthy
- Icon with amber badge: some connectors degraded
- Grayed icon: system offline

---

## 5. Claude Code Integration - Deep Dive

This is the most novel and pressing use case, so it deserves detailed treatment.

### 5.1 Hook Setup (Auto-Installer)

iDashboard provides a CLI command / setup wizard that automatically configures Claude Code hooks:

```bash
# Auto-configure Claude Code hooks
idashboard setup claude-code
```

This modifies `~/.claude/settings.json` to add Notification and Stop hooks pointing at iDashboard's local API.

### 5.2 Event Flow

```
Claude Code (terminal tab 3)
    │
    │ [Claude asks user to choose option A or B]
    │ [Notification hook fires]
    │
    ▼
curl POST localhost:19280/api/v1/events
    │
    ▼
iDashboard main process
    │ Validates, normalizes event
    │ Assigns uiHints (blinking, color)
    │
    ▼
Event Bus → Zustand Store
    │
    ▼
UI renders blinking button:
  ┌──────────────────────────────┐
  │ ⚡ Claude Code: my-project   │  ← blinks orange for 30s
  │ "Choose: Option A or B"      │
  │ [Focus Terminal] [Dismiss]   │
  └──────────────────────────────┘
```

### 5.3 Actions from Dashboard

| Action | What it does |
|--------|-------------|
| **Focus Terminal** | Runs `osascript` (macOS) / `wmctrl` (Linux) / `nircmd` (Windows) to bring the terminal window to front |
| **Dismiss** | Removes the notification, stops blinking |
| **Auto-Dismiss** | After blink duration expires, event stays but stops blinking |
| **Quick Note** | (Future) Send a text response back if Claude Code ever exposes a message queue API |

### 5.4 Multiple Claude Code Sessions

Each session sends its session ID. The dashboard shows one widget/button per active session:

```
┌────────────────────────────────────────┐
│ Claude Code Sessions                    │
│                                         │
│ ⚡ iDashboard (needs input)      [Focus]│  ← blinking
│ ✓  api-refactor (running)               │  ← green, no action needed
│ ✓  docs-update (completed)       [Clear]│  ← grey
└─────────────────────────────────────────┘
```

---

## 6. Project Structure

```
iDashboard/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── vite.config.ts
│
├── src/
│   ├── main/                          # Electron main process
│   │   ├── index.ts                   # App entry, window management
│   │   ├── api/                       # Local HTTP API server
│   │   │   ├── server.ts              # Fastify server setup
│   │   │   ├── routes/
│   │   │   │   ├── events.ts          # POST/GET/DELETE events
│   │   │   │   ├── actions.ts         # Trigger connector actions
│   │   │   │   ├── connectors.ts      # List connector statuses
│   │   │   │   └── health.ts          # Health check
│   │   │   └── websocket.ts           # WebSocket handler
│   │   │
│   │   ├── connectors/                # Connector engine
│   │   │   ├── engine.ts              # Scheduler, lifecycle manager
│   │   │   ├── base.ts                # Base connector class
│   │   │   ├── claude-code.ts         # Claude Code (push)
│   │   │   ├── octopus-deploy.ts      # OctopusDeploy (pull)
│   │   │   ├── teamcity.ts            # TeamCity (pull)
│   │   │   ├── graylog.ts             # Graylog (pull)
│   │   │   ├── generic-http.ts        # Generic HTTP (pull)
│   │   │   └── generic-push.ts        # Generic push handler
│   │   │
│   │   ├── db/                        # Database layer (SQLite)
│   │   │   ├── connection.ts          # Database init, WAL mode, pragmas
│   │   │   ├── schema.ts             # Drizzle ORM schema (events, connectorState, dailyAggregates, kvCache)
│   │   │   ├── migrations/            # Auto-generated migration SQL files (drizzle-kit)
│   │   │   ├── event-store.ts         # Insert/query/purge events, deduplication
│   │   │   ├── aggregator.ts          # Daily aggregate rollup logic
│   │   │   └── maintenance.ts         # Retention purge, VACUUM scheduling
│   │   │
│   │   ├── services/                  # Cross-cutting main-process services
│   │   │   ├── network-reachability.ts # Layered network detection (L0-L4)
│   │   │   └── circuit-breaker.ts     # Per-connector circuit breaker + backoff
│   │   │
│   │   ├── config/                    # Configuration loader
│   │   │   ├── loader.ts              # YAML parsing, env substitution
│   │   │   ├── schema.ts              # Config validation schemas (Zod)
│   │   │   └── defaults.ts            # Default configurations
│   │   │
│   │   ├── ipc/                       # Electron IPC handlers
│   │   │   └── channels.ts            # Typed IPC channel definitions
│   │   │
│   │   └── window/                    # Window management
│   │       ├── manager.ts             # Window modes, positioning
│   │       └── tray.ts                # System tray setup
│   │
│   ├── renderer/                      # Electron renderer (React app)
│   │   ├── index.html
│   │   ├── main.tsx                   # React entry
│   │   ├── App.tsx                    # Root component
│   │   │
│   │   ├── store/                     # Zustand state management
│   │   │   ├── dashboard.ts           # Main dashboard store
│   │   │   ├── events.ts              # Event state slice
│   │   │   ├── layout.ts             # Layout/UI state slice
│   │   │   └── network.ts            # Network reachability + connector health state
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AdaptiveGrid.tsx   # Size-tier-aware grid
│   │   │   │   ├── WidgetContainer.tsx# Individual widget wrapper
│   │   │   │   └── TierSwitch.tsx     # Renders correct tier variant
│   │   │   │
│   │   │   ├── widgets/               # Connector-specific widgets
│   │   │   │   ├── ClaudeCodeWidget.tsx
│   │   │   │   ├── OctopusWidget.tsx
│   │   │   │   ├── TeamCityWidget.tsx
│   │   │   │   ├── GraylogWidget.tsx
│   │   │   │   └── GenericWidget.tsx
│   │   │   │
│   │   │   ├── tiers/                 # Size-tier component variants
│   │   │   │   ├── IconTier.tsx       # icon tier (aggregate)
│   │   │   │   ├── MicroTier.tsx      # micro tier (icon strip)
│   │   │   │   ├── CompactTier.tsx    # compact tier (rows)
│   │   │   │   ├── StandardTier.tsx   # standard tier (cards)
│   │   │   │   └── ExpandedTier.tsx   # expanded tier (full grid)
│   │   │   │
│   │   │   ├── common/
│   │   │   │   ├── BlinkingIcon.tsx   # Attention animation
│   │   │   │   ├── SeverityBadge.tsx
│   │   │   │   ├── ActionButton.tsx
│   │   │   │   ├── EventTimeline.tsx
│   │   │   │   ├── NetworkStatusBar.tsx # Global online/offline/degraded/VPN banner
│   │   │   │   └── HealthDot.tsx      # Per-connector health indicator dot
│   │   │   │
│   │   │   └── settings/              # Settings UI (expanded tier)
│   │   │       ├── ConnectorConfig.tsx
│   │   │       ├── LayoutEditor.tsx
│   │   │       └── GeneralSettings.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useSizeTier.ts         # Window size → tier mapping
│   │   │   ├── useConnectorEvents.ts  # Subscribe to connector events
│   │   │   ├── useBlinkAnimation.ts   # Blink timing logic
│   │   │   └── useNetworkStatus.ts    # Subscribe to network reachability state
│   │   │
│   │   └── styles/
│   │       ├── globals.css            # Tailwind + base styles
│   │       └── animations.css         # Blink, pulse, attention animations
│   │
│   ├── shared/                        # Shared types (main + renderer)
│   │   ├── types.ts                   # ConnectorEvent, Config types, etc.
│   │   ├── constants.ts               # Shared constants
│   │   └── ipc-channels.ts            # IPC channel type definitions
│   │
│   └── cli/                           # CLI utilities
│       └── setup.ts                   # `idashboard setup` command
│
├── configs/                           # Example/default configs
│   ├── config.example.yaml
│   └── connectors/
│       ├── claude-code.example.yaml
│       ├── teamcity.example.yaml
│       ├── octopus-deploy.example.yaml
│       └── graylog.example.yaml
│
├── drizzle.config.ts                 # Drizzle Kit config (migration generation)
│
└── tests/
    ├── unit/
    │   ├── connectors/
    │   ├── store/
    │   ├── db/                        # Event store, aggregator, retention
    │   ├── services/                  # Circuit breaker, network reachability
    │   └── config/
    └── e2e/
```

---

## 7. Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** Working app with Claude Code attention notifications + one pull connector + persistent storage + network health.

1. **Electron shell** - Window management, system tray, free-form resizing
2. **Docking system** - Snap to screen edges/corners, configurable offset
3. **Temporary always-on-top** - Surface on notification, auto-hide after configurable duration, flash count
4. **Local API server** - Fastify on localhost, `POST /events` endpoint
5. **SQLite database** - better-sqlite3 + Drizzle ORM, WAL mode, schema migrations, event store + connector state tables
6. **Event bus + Zustand store** - Core reactive state, synced from SQLite via IPC
7. **Network reachability (L0+L1)** - `net.isOnline()` event-driven detection + VPN interface heuristic via `os.networkInterfaces()`. Global offline banner in UI.
8. **Circuit breaker + backoff** - Per-connector health tracking, exponential backoff on failure, circuit state machine
9. **Adaptive UI skeleton** - Fluid sizing with CSS container queries, ResizeObserver-driven layout
10. **Claude Code connector** - Push via hooks, blinking notification, focus-terminal action
11. **TeamCity connector** - Pull via REST API, build status display
12. **Configuration system** - YAML config loader, hot-reload, env variable substitution, Zod validation
13. **Basic theming** - Dark mode default

**Deliverable:** User can install, configure Claude Code hooks, and see blinking notifications when Claude needs input. Window docks to a screen corner, surfaces temporarily on notification, hides after 30s. TeamCity build status visible. Events persist across app restarts. Connectors gracefully back off when endpoints are unreachable, with clear UI indicators (health dots, offline banner). All behavior configurable via `~/.idashboard/config.yaml`.

### Phase 2: Connector Expansion + Data

1. **OctopusDeploy connector** - Full deployment monitoring
2. **Graylog connector** - Alert monitoring, custom log queries
3. **Generic HTTP connector** - User-configurable REST polling
4. **Generic Push connector** - Accept arbitrary events via API
5. **Network reachability (L2)** - DNS pre-checks per hostname, VPN-dependent connector flagging
6. **Daily aggregate rollups** - Pre-computed trend data from raw events
7. **Data retention** - Automatic purge of old events, configurable retention days
8. **WebSocket support** - Real-time bidirectional communication
9. **Sound notifications** - Configurable audio alerts

### Phase 3: Rich UI + Analytics

1. **react-grid-layout integration** - Drag/resize widgets in expanded/fullscreen mode
2. **Layout persistence** - Save/load widget layouts (stored in SQLite `kvCache`)
3. **Settings UI** - In-app connector configuration editor (in fullscreen mode)
4. **Event history timeline** - Scrollable event log with filters, queried from SQLite
5. **Trend charts** - Build success rate, deploy frequency, alert trends (powered by daily aggregates)
6. **Custom themes** - User-defined color schemes via theme YAML
7. **Network diagnostics panel** - Detailed per-connector health view (latency, circuit state, failure layer)

### Phase 4: Advanced Features

1. **Connector SDK** - Plugin system for community connectors
2. **Cross-connector rules** - "If TeamCity fails AND Octopus has pending deployment, escalate severity"
3. **Keyboard shortcuts** - Quick actions without mouse
4. **Multi-monitor support** - Pin to specific display
5. **CLI tool** - `idashboard push "message"` from any script
6. **Auto-updater** - Electron auto-update integration
7. **Data export** - Export event history as CSV/JSON for external analysis

---

## 8. Key Design Decisions & Trade-offs

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Desktop framework | Electron | Tauri, Hammerspoon, Übersicht | JS-only stack, trivial HTTP server, mature overlay/dock support. Mac-native tools lack the full feature set (see Section 1.5). Accept higher memory. |
| UI sizing model | Continuous fluid (CSS Container Queries + ResizeObserver) | Preset size tiers | User wants free-form resize, not predefined breakpoints. Container queries give per-widget fluid adaptation. |
| State management | Zustand | Redux, MobX, Jotai | Minimal boilerplate, great TS support, easy IPC sync |
| Config format | YAML | JSON, TOML | Human-readable, supports comments, familiar to DevOps. Hot-reload via `fs.watch()`. |
| Config scope | Everything configurable | Hardcoded defaults | User requirement: nothing set in stone. Every behavioral parameter has a config key with sensible defaults. |
| Local storage | better-sqlite3 + Drizzle ORM | sql.js (WASM), DuckDB, LevelDB, NeDB | Native SQLite: 30-40k inserts/sec, WAL mode, 2-4MB binary, mature Electron support. Drizzle adds type-safe queries + migrations. DuckDB too slow for inserts, too large. NeDB/LokiJS abandoned. |
| Secrets storage | Electron safeStorage | Plaintext in config, custom encryption | OS-level encryption (macOS Keychain). Zero custom crypto. Secrets never touch disk in plaintext. |
| Network detection | Layered (L0-L4) | Single ping, navigator.onLine only | `navigator.onLine` gives false positives. Layered approach: instant offline detection + VPN heuristic + DNS + HTTP + circuit breaker. Degrades gracefully at each level. |
| VPN detection | `os.networkInterfaces()` heuristic | Native NWPathMonitor addon | No native code needed. utun/tun interface check + DNS resolve of internal hostnames is sufficient. Native addon is overkill for this use case. |
| API framework | Fastify | Express, Koa | Schema validation, fast, good plugin ecosystem |
| Grid layout | react-grid-layout | CSS Grid manual, Gridstack | Built-in drag/resize, React-native. Only used in fullscreen/expanded mode. |
| Styling | Tailwind + Container Queries | CSS Modules, styled-components | Rapid development, container queries for per-widget fluid adaptation |
| Claude Code integration | Hooks → HTTP push | Process monitoring, PTY sniffing | Official supported mechanism, clean separation |
| Connector flexibility | Auto-discovery + Generic HTTP + Generic Push | Formal plugin SDK | Low barrier to add connectors: drop a file or write YAML. Formal SDK deferred to Phase 4. |

---

## 9. Security Considerations

- **Local API binds to 127.0.0.1 only** - Never exposed to network
- **No secrets in config files** - All auth tokens via `${ENV_VAR}` references
- **Secrets encrypted at rest** - API tokens stored via Electron `safeStorage` (macOS Keychain). Never written to disk in plaintext.
- **Optional API authentication** - Bearer token for local API if desired
- **Rate limiting** - Prevent runaway scripts from flooding events
- **No eval/exec of user input** - Event data is sanitized before rendering
- **Context isolation** - Electron renderer has no direct Node.js access
- **CSP headers** - Strict Content Security Policy in renderer
- **SQLite in user data directory** - Database file in `app.getPath('userData')`, not world-readable. Contains event data, not credentials.

---

## 10. Testing Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Connector logic | Vitest | Each connector's poll/normalize logic with mocked HTTP |
| State management | Vitest | Store actions, event lifecycle, TTL expiry |
| API routes | Vitest + Supertest | All endpoints, validation, error handling |
| Database | Vitest | Event insert/query/purge, aggregate rollup, retention, schema migrations (in-memory SQLite) |
| Circuit breaker | Vitest | State transitions (closed→open→half-open→closed), backoff calculation, jitter |
| Network reachability | Vitest | VPN interface detection, DNS mock, overall state computation |
| UI components | Vitest + React Testing Library | Fluid sizing, widget rendering, animations, health indicators |
| E2E flows | Playwright for Electron | Full flow: push event → DB persist → UI update → action execution |
| Config parsing | Vitest | YAML loading, env substitution, schema validation |

---

## 11. Future Connector Ideas

Beyond Phase 1-2, the connector system can expand to:

| Connector | Direction | Purpose |
|-----------|-----------|---------|
| GitHub Actions | Pull | Workflow run status, PR checks |
| Jenkins | Pull | Build pipeline monitoring |
| Docker/K8s | Pull | Container health, pod status |
| PagerDuty | Pull+Push | Incident awareness |
| Slack | Push | Forward specific Slack messages to dashboard |
| Custom Webhook | Push | Generic webhook receiver (GitHub, GitLab, etc.) |
| Prometheus/Grafana | Pull | Metric threshold alerts |
| AWS CloudWatch | Pull | AWS resource alerts |
| Process Monitor | Pull | Local process CPU/memory watching |

---

## 12. Open Questions for User Input

Decisions resolved by user requirements:
- ~~Primary OS target?~~ → **macOS-first** (Linux/Windows deferred)
- ~~Preset size tiers vs. free-form?~~ → **Free-form resize** with fluid CSS container queries
- ~~Window modes?~~ → **Dockable to edges/corners + temporary always-on-top** (30s default, configurable)
- ~~How configurable?~~ → **Everything via config file**, nothing hardcoded
- ~~Custom connector plugins?~~ → **High flexibility**: auto-discover connector files + generic HTTP/push connectors for zero-code setup. Formal SDK deferred to Phase 4.
- ~~Event persistence?~~ → **SQLite** via better-sqlite3 + Drizzle ORM. Events survive restart. 30-day retention with daily aggregates for trends.
- ~~Network reachability?~~ → **Layered detection**: `net.isOnline()` + VPN heuristic + DNS resolve + circuit breaker with exponential backoff. No native macOS addons needed.

Remaining open questions:

1. **Claude Code hook installer** - Should the setup wizard modify `~/.claude/settings.json` automatically, or just print instructions?
2. **Multi-user** - Will this ever need to aggregate data from multiple developers, or is it strictly a personal tool?
3. **Notification sounds** - Default system sounds, or bundled custom sounds?
4. **Config file location** - `~/.idashboard/` (XDG-style) or `~/.config/idashboard/` (Linux convention) or alongside the app?
