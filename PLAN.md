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

### 3.4 Build & Dev Tooling

| Tool | Purpose |
|------|---------|
| **Vite** | Frontend bundling (fast HMR, Electron-compatible via `electron-vite`) |
| **electron-builder** | Packaging and distribution |
| **TypeScript** | End-to-end type safety |
| **Vitest** | Unit testing |
| **Playwright** | E2E testing for Electron |
| **ESLint + Prettier** | Code quality |

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
│   │   │   └── layout.ts             # Layout/UI state slice
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
│   │   │   │   └── EventTimeline.tsx
│   │   │   │
│   │   │   └── settings/              # Settings UI (expanded tier)
│   │   │       ├── ConnectorConfig.tsx
│   │   │       ├── LayoutEditor.tsx
│   │   │       └── GeneralSettings.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useSizeTier.ts         # Window size → tier mapping
│   │   │   ├── useConnectorEvents.ts  # Subscribe to connector events
│   │   │   └── useBlinkAnimation.ts   # Blink timing logic
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
└── tests/
    ├── unit/
    │   ├── connectors/
    │   └── store/
    └── e2e/
```

---

## 7. Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** Working app with Claude Code attention notifications + one pull connector.

1. **Electron shell** - Window management, system tray, free-form resizing
2. **Docking system** - Snap to screen edges/corners, configurable offset
3. **Temporary always-on-top** - Surface on notification, auto-hide after configurable duration, flash count
4. **Local API server** - Fastify on localhost, `POST /events` endpoint
5. **Event bus + Zustand store** - Core reactive state
6. **Adaptive UI skeleton** - Fluid sizing with CSS container queries, ResizeObserver-driven layout
7. **Claude Code connector** - Push via hooks, blinking notification, focus-terminal action
8. **TeamCity connector** - Pull via REST API, build status display
9. **Configuration system** - YAML config loader, hot-reload, env variable substitution, Zod validation
10. **Basic theming** - Dark mode default

**Deliverable:** User can install, configure Claude Code hooks, and see blinking notifications when Claude needs input. Window docks to a screen corner, surfaces temporarily on notification, hides after 30s. TeamCity build status visible. All behavior configurable via `~/.idashboard/config.yaml`.

### Phase 2: Connector Expansion

1. **OctopusDeploy connector** - Full deployment monitoring
2. **Graylog connector** - Alert monitoring, custom log queries
3. **Generic HTTP connector** - User-configurable REST polling
4. **Generic Push connector** - Accept arbitrary events via API
5. **WebSocket support** - Real-time bidirectional communication
6. **Sound notifications** - Configurable audio alerts

### Phase 3: Rich UI

1. **react-grid-layout integration** - Drag/resize widgets in expanded/fullscreen mode
2. **Layout persistence** - Save/load widget layouts as YAML
3. **Settings UI** - In-app connector configuration editor (in fullscreen mode)
4. **Event history timeline** - Scrollable event log with filters
5. **Custom themes** - User-defined color schemes via theme YAML

### Phase 4: Advanced Features

1. **Connector SDK** - Plugin system for community connectors
2. **Cross-connector rules** - "If TeamCity fails AND Octopus has pending deployment, escalate severity"
3. **Keyboard shortcuts** - Quick actions without mouse
4. **Multi-monitor support** - Pin to specific display
5. **CLI tool** - `idashboard push "message"` from any script
6. **Auto-updater** - Electron auto-update integration

---

## 8. Key Design Decisions & Trade-offs

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Desktop framework | Electron | Tauri, Hammerspoon, Übersicht | JS-only stack, trivial HTTP server, mature overlay/dock support. Mac-native tools lack the full feature set (see Section 1.5). Accept higher memory. |
| UI sizing model | Continuous fluid (CSS Container Queries + ResizeObserver) | Preset size tiers | User wants free-form resize, not predefined breakpoints. Container queries give per-widget fluid adaptation. |
| State management | Zustand | Redux, MobX, Jotai | Minimal boilerplate, great TS support, easy IPC sync |
| Config format | YAML | JSON, TOML | Human-readable, supports comments, familiar to DevOps. Hot-reload via `fs.watch()`. |
| Config scope | Everything configurable | Hardcoded defaults | User requirement: nothing set in stone. Every behavioral parameter has a config key with sensible defaults. |
| API framework | Fastify | Express, Koa | Schema validation, fast, good plugin ecosystem |
| Grid layout | react-grid-layout | CSS Grid manual, Gridstack | Built-in drag/resize, React-native. Only used in fullscreen/expanded mode. |
| Styling | Tailwind + Container Queries | CSS Modules, styled-components | Rapid development, container queries for per-widget fluid adaptation |
| Claude Code integration | Hooks → HTTP push | Process monitoring, PTY sniffing | Official supported mechanism, clean separation |
| Connector flexibility | Auto-discovery + Generic HTTP + Generic Push | Formal plugin SDK | Low barrier to add connectors: drop a file or write YAML. Formal SDK deferred to Phase 4. |

---

## 9. Security Considerations

- **Local API binds to 127.0.0.1 only** - Never exposed to network
- **No secrets in config files** - All auth tokens via `${ENV_VAR}` references
- **Optional API authentication** - Bearer token for local API if desired
- **Rate limiting** - Prevent runaway scripts from flooding events
- **No eval/exec of user input** - Event data is sanitized before rendering
- **Context isolation** - Electron renderer has no direct Node.js access
- **CSP headers** - Strict Content Security Policy in renderer

---

## 10. Testing Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Connector logic | Vitest | Each connector's poll/normalize logic with mocked HTTP |
| State management | Vitest | Store actions, event lifecycle, TTL expiry |
| API routes | Vitest + Supertest | All endpoints, validation, error handling |
| UI components | Vitest + React Testing Library | Fluid sizing, widget rendering, animations |
| E2E flows | Playwright for Electron | Full flow: push event → UI update → action execution |
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

Remaining open questions:

1. **Claude Code hook installer** - Should the setup wizard modify `~/.claude/settings.json` automatically, or just print instructions?
2. **Event persistence** - Should events survive app restart (SQLite/file) or is in-memory sufficient?
3. **Multi-user** - Will this ever need to aggregate data from multiple developers, or is it strictly a personal tool?
4. **Notification sounds** - Default system sounds, or bundled custom sounds?
5. **Config file location** - `~/.idashboard/` (XDG-style) or `~/.config/idashboard/` (Linux convention) or alongside the app?
