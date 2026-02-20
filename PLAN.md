# iDashboard - Comprehensive Application Plan

## 1. Vision & Problem Statement

**iDashboard** is a lightweight, always-accessible desktop dashboard that acts as a unified nerve center for developer tooling. It solves two core problems:

1. **Passive monitoring** - Aggregating status/data from multiple DevOps and development tools (OctopusDeploy, Graylog, TeamCity, etc.) into a single glanceable view.
2. **Active attention routing** - Tools like Claude Code, Cursor, and long-running processes can *push* notifications to the dashboard when they need human attention, eliminating the need to constantly poll terminal tabs.

The UI must be **resolution-adaptive**: usable as a 200x100px system tray popover showing only critical icons, a 400x300px floating widget with compact status rows, or a fullscreen dashboard with rich detail panels.

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

The connector engine is the heart of the data collection system. Each connector is a self-contained module that knows how to talk to one external system.

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

**Widget behavior at different sizes:**
| Size | Display |
|------|---------|
| Tiny (icon only) | Blinking Claude icon with attention color |
| Small (200x100) | `CC: session-name ⚡` blinking row |
| Medium (400x300) | Full card with session name, message preview, action buttons |
| Large (fullscreen) | Card + full message + conversation context + quick-reply |

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

The UI adapts to the window's actual pixel dimensions, not just viewport breakpoints. This is critical because the user might have a 200x100px overlay *or* a fullscreen dashboard.

#### Size Tiers

```typescript
type SizeTier = 'icon' | 'micro' | 'compact' | 'standard' | 'expanded';

// Determined by window dimensions
function getSizeTier(width: number, height: number): SizeTier {
  const area = width * height;
  if (area < 30000)  return 'icon';      // ~170x170 or smaller
  if (area < 80000)  return 'micro';     // ~280x280 or smaller
  if (area < 200000) return 'compact';   // ~450x450 or smaller
  if (area < 500000) return 'standard';  // ~700x700 or smaller
  return 'expanded';                      // fullscreen
}
```

#### What Each Tier Shows

| Tier | Dimensions (approx) | Content |
|------|---------------------|---------|
| **icon** | < 170x170 | Single aggregate status icon. Red = attention needed, Green = all clear, Yellow = warnings. Click expands. |
| **micro** | ~200x100 to ~280x280 | Icon strip: one icon per connector with status color + badge count. Blinking icons for attention events. |
| **compact** | ~300x200 to ~450x450 | Stacked rows: `[icon] [connector name] [status text] [badge]`. Scrollable. Action buttons as icon-only. |
| **standard** | ~500x400 to ~700x700 | Grid of widget cards. Each card shows connector name, latest event, severity bar, and action buttons with labels. |
| **expanded** | Fullscreen | Full grid layout with drag/resize. Event history timeline. Detailed panels. Charts for trends. Configuration UI. |

#### Widget Configuration

Each connector defines how its widget renders at each tier:

```yaml
connectors:
  - id: claude-code-main
    type: claude-code
    ui:
      icon: "terminal"           # icon name from icon set
      color: "#f97316"           # brand color
      tiers:
        micro:
          showBadge: true
          blinkOnAttention: true
        compact:
          showLastEvent: true
          maxTitleLength: 30
        standard:
          showActions: true
          showEventHistory: 3    # last 3 events
        expanded:
          showFullHistory: true
          showChart: false
          customComponent: null   # or path to custom React component
```

#### Window Modes

iDashboard supports multiple window modes that the user can switch between:

| Mode | Behavior |
|------|----------|
| **Floating** | Always-on-top, draggable, resizable. Semi-transparent background. |
| **Docked** | Snaps to screen edge (top/bottom/left/right). Auto-hides when no attention events. |
| **Tray Popup** | Lives in system tray. Click tray icon → popup appears near tray. |
| **Fullscreen** | Regular maximized window. Shows expanded UI with all features. |

---

### 4.5 Configuration System

All configuration lives in YAML files for easy editing. The app also provides a GUI config editor in expanded mode.

#### Directory Structure

```
~/.idashboard/
├── config.yaml              # Main app config
├── connectors/
│   ├── claude-code.yaml     # One file per connector instance
│   ├── teamcity-prod.yaml
│   ├── octopus-prod.yaml
│   └── graylog-main.yaml
├── layouts/
│   ├── default.yaml         # Default layout
│   └── compact.yaml         # User-saved layouts
└── themes/
    └── custom.yaml          # Custom theme overrides
```

#### Main Config (`config.yaml`)

```yaml
app:
  port: 19280                     # Local API port
  startMinimized: true            # Start in system tray
  defaultWindowMode: floating
  defaultSize: { width: 400, height: 300 }
  alwaysOnTop: true
  opacity: 0.95                   # Window opacity (floating mode)
  theme: dark                     # dark | light | auto

api:
  bind: "127.0.0.1"
  auth:
    enabled: false                # Enable bearer token auth
    token: "${ENV_IDASHBOARD_TOKEN}"

events:
  maxHistory: 1000
  defaultTTL: 3600000             # 1 hour in ms
  attentionBlinkDefault: 30000    # 30 seconds

notifications:
  sound: true                     # Play sound on attention events
  soundFile: null                 # Custom sound file path (null = default)
  nativeNotification: true        # Also show OS notification
```

#### Connector Config Example (`connectors/teamcity-prod.yaml`)

```yaml
id: teamcity-prod
type: teamcity
displayName: "TeamCity Production"
enabled: true
pollIntervalMs: 15000

auth:
  type: bearer
  token: "${ENV_TC_TOKEN}"

settings:
  baseUrl: "https://teamcity.company.com"
  buildConfigs:                    # Only monitor these (empty = all)
    - "MyProject_Build"
    - "MyProject_Deploy"
  failureThreshold: 2             # Alert after N consecutive failures
  queueDepthWarning: 5            # Warn if queue exceeds this

ui:
  icon: "hammer"
  color: "#06b6d4"
  priority: 2                     # Sort order in dashboard (lower = higher)
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

1. **Electron shell** - Window management, system tray, always-on-top, resizing
2. **Local API server** - Fastify on localhost, `POST /events` endpoint
3. **Event bus + Zustand store** - Core reactive state
4. **Adaptive UI skeleton** - Size tier detection, tier switching, basic grid
5. **Claude Code connector** - Push via hooks, blinking notification, focus-terminal action
6. **TeamCity connector** - Pull via REST API, build status display
7. **Configuration system** - YAML loader, env variable substitution
8. **Basic theming** - Dark mode default

**Deliverable:** User can install, configure Claude Code hooks, and see blinking notifications when Claude needs input. TeamCity build status visible.

### Phase 2: Connector Expansion

1. **OctopusDeploy connector** - Full deployment monitoring
2. **Graylog connector** - Alert monitoring, custom log queries
3. **Generic HTTP connector** - User-configurable REST polling
4. **Generic Push connector** - Accept arbitrary events via API
5. **WebSocket support** - Real-time bidirectional communication
6. **Sound notifications** - Configurable audio alerts

### Phase 3: Rich UI

1. **react-grid-layout integration** - Drag/resize widgets in expanded mode
2. **Layout persistence** - Save/load layouts
3. **Settings UI** - In-app connector configuration editor
4. **Event history timeline** - Scrollable event log with filters
5. **Custom themes** - User-defined color schemes
6. **Multiple window modes** - Docked, floating, tray popup

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
| Desktop framework | Electron | Tauri | JS-only stack, trivial HTTP server, mature overlay support. Accept higher memory. |
| State management | Zustand | Redux, MobX, Jotai | Minimal boilerplate, great TS support, easy IPC sync |
| Config format | YAML | JSON, TOML | Human-readable, supports comments, familiar to DevOps |
| API framework | Fastify | Express, Koa | Schema validation, fast, good plugin ecosystem |
| Grid layout | react-grid-layout | CSS Grid manual, Gridstack | Built-in breakpoints, drag/resize, React-native |
| Styling | Tailwind + Container Queries | CSS Modules, styled-components | Rapid development, container queries for per-widget adaptation |
| Claude Code integration | Hooks → HTTP push | Process monitoring, PTY sniffing | Official supported mechanism, clean separation |

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
| UI components | Vitest + React Testing Library | Tier switching, widget rendering, animations |
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

These decisions should be made before or during Phase 1 implementation:

1. **Primary OS target?** - macOS, Windows, Linux, or all three from the start?
2. **Claude Code hook installer** - Should the setup wizard modify `~/.claude/settings.json` automatically, or just print instructions?
3. **Event persistence** - Should events survive app restart (SQLite/file) or is in-memory sufficient?
4. **Multi-user** - Will this ever need to aggregate data from multiple developers, or is it strictly a personal tool?
5. **Custom connector plugins** - How important is a formal plugin SDK vs. just using the generic HTTP/push connectors?
6. **Notification sounds** - Default system sounds, or bundled custom sounds?
