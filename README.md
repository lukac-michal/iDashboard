# iDashboard

A lightweight desktop dashboard for developer tool monitoring and attention routing. Aggregates events from AI coding assistants (Claude Code, Cursor), CI/CD pipelines, and other DevOps tools into a single glanceable window.

![Dashboard](docs/images/dashboard-normal.png)

## Why

When running multiple AI agents, CI builds, or deploy pipelines, you lose track of which tool needs attention. iDashboard sits in a small always-on-top window and blinks when something requires your input — then lets you click to jump straight to the right terminal tab or editor window.

## Features

- **Push & pull connectors** — receive webhooks from tools like Claude Code and Cursor, or poll REST APIs like GitHub and TeamCity
- **Attention routing** — events surface with severity levels (`info`, `warning`, `error`, `critical`, `attention`) with blinking indicators for urgent items
- **One-click focus** — "Focus Terminal" jumps to the correct iTerm2 tab by session name; "Focus Editor" activates Cursor
- **Fluid responsive UI** — resize from a tiny 200px widget to full-screen; layout adapts automatically
- **Network health** — circuit breakers, VPN detection, per-connector reachability diagnostics
- **Event history** — SQLite-backed storage with configurable retention, deduplication, and export
- **YAML configuration** — all settings in `~/.idashboard/config.yaml`, connectors in `~/.idashboard/connectors/`

<details>
<summary>More screenshots</summary>

### Settings
![Settings](docs/images/settings-panel.png)

### Health & Diagnostics
![Health](docs/images/health-panel.png)

</details>

## Quick Start

### Prerequisites

- Node.js 20+
- macOS (primary target), Linux, or Windows

### Install & Run

```bash
git clone https://github.com/lukac-michal/iDashboard.git
cd iDashboard
npm install
npx electron-rebuild -f -w better-sqlite3   # rebuild native module for Electron
npm run dev                                   # start in dev mode
```

On first launch, default config files are created at `~/.idashboard/`.

### Build & Package

```bash
npm run build      # production build
npm run package    # create installer (DMG on macOS, AppImage on Linux)
```

## Connectors

### Currently Supported

| Connector | Type | Description |
|-----------|------|-------------|
| **Claude Code** | Push | Receives events via [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) when the agent needs input or finishes a task |
| **Cursor** | Push | Receives events via [Cursor hooks](https://docs.cursor.com/context/hooks) on agent task completion |
| **GitHub** | Pull | Repository, PR, and issue monitoring |
| **TeamCity** | Pull | CI/CD build status |
| **Octopus Deploy** | Pull | Deployment and release monitoring |
| **Graylog** | Pull | Log aggregation alerts |
| **Slack** | Pull | Channel and mention monitoring |
| **Generic HTTP** | Pull | Poll any REST API |
| **Generic Push** | Push | Accept arbitrary events via HTTP POST |
| **Webhook** | Push | Built-in parsers for GitHub, GitLab, Bitbucket, PagerDuty |

### Setting Up Claude Code

Add hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [{
          "type": "command",
          "command": "curl -s -X POST http://localhost:19280/api/v1/events -H 'Content-Type: application/json' -d '{\"connector\": \"claude-code\", \"event\": \"needs-input\", \"session\": \"'$(basename $PWD)'\"}'",
          "async": true
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "curl -s -X POST http://localhost:19280/api/v1/events -H 'Content-Type: application/json' -d '{\"connector\": \"claude-code\", \"event\": \"task-complete\", \"session\": \"'$(basename $PWD)'\"}'",
          "async": true
        }]
      }
    ]
  }
}
```

When Claude Code finishes a task or needs input, iDashboard blinks and shows a "Focus Terminal" button that activates the correct iTerm2/Terminal tab.

### Setting Up Cursor

Add hooks to `~/.cursor/hooks.json`:

```json
{
  "hooks": {
    "stop": [{
      "command": "curl -s -X POST http://localhost:19280/api/v1/events -H 'Content-Type: application/json' -d '{\"connector\":\"cursor\",\"event\":\"task-complete\",\"session\":\"'$(basename $PWD)'\"}'",
      "type": "command",
      "blocking": false
    }]
  }
}
```

### Testing Manually

Send a test event to verify the setup:

```bash
curl -X POST http://localhost:19280/api/v1/events \
  -H 'Content-Type: application/json' \
  -d '{"connector":"claude-code","event":"task-complete","session":"my-project"}'
```

## Configuration

All configuration lives in `~/.idashboard/`:

```
~/.idashboard/
  config.yaml              # main app config (window, API, notifications, network)
  connectors/
    claude-code.yaml       # Claude Code connector config
    cursor.yaml            # Cursor IDE connector config
    github.yaml            # GitHub connector config (needs API token)
    ...
```

### Key Config Options

| Setting | Default | Description |
|---------|---------|-------------|
| `window.defaultMode` | `floating` | `floating`, `docked`, `tray`, or `fullscreen` |
| `window.opacity` | `0.95` | Window transparency (0.0 - 1.0) |
| `window.alwaysOnTop.onNotification.enabled` | `true` | Auto-surface on important events |
| `window.alwaysOnTop.onNotification.durationSec` | `30` | How long to stay on top |
| `api.port` | `19280` | Local HTTP API port |
| `notifications.blinkMinSeverity` | `info` | Minimum severity to trigger blink |
| `events.maxHistory` | `1000` | Max events kept in memory |
| `storage.retentionDays` | `30` | SQLite event retention |

## Local API

Base URL: `http://localhost:19280/api/v1`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events` | `POST` | Push an event from an external tool |
| `/events` | `GET` | List active events |
| `/events/history` | `GET` | Query historical events |
| `/connectors` | `GET` | Connector status and health |

### Event Schema

```json
{
  "connector": "claude-code",
  "event": "needs-input",
  "session": "my-project",
  "message": "Choose option A or B",
  "severity": "attention"
}
```

Supported `event` types: `needs-input`, `task-complete`, or any custom string.
Supported `severity` levels: `info`, `warning`, `error`, `critical`, `attention`.

## Development

```bash
npm run dev          # dev mode with hot reload
npm test             # run unit tests (70 tests)
npm run test:watch   # watch mode
npm run lint         # ESLint
npm run typecheck    # TypeScript check
```

### Tech Stack

- **Electron 34** + **Electron Vite** — desktop shell and fast builds
- **React 19** + **Zustand** — UI and state management
- **Tailwind CSS 4** — styling
- **Fastify 5** — local HTTP API server
- **Better SQLite 3** + **Drizzle ORM** — event storage
- **Vitest** — unit tests

### Project Structure

```
src/
  main/           # Electron main process
    connectors/   # Connector implementations (claude-code, cursor, github, etc.)
    services/     # Auth, circuit breaker, network reachability
    ipc/          # IPC channel handlers
  renderer/       # React frontend
    components/   # UI components (dashboard, settings, health panels)
    store/        # Zustand state stores
    hooks/        # Custom React hooks
  shared/         # Types, constants, IPC channel definitions
  preload/        # Electron preload bridge
```

## License

MIT
