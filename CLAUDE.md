# CLAUDE.md

Rules and constraints for Claude Code when working in the iDashboard repository.

## Project Overview

- **Electron + React + TypeScript** desktop app for developer tool monitoring and attention routing
- **Stack**: Electron 34, React 19, Vite (electron-vite), Tailwind v4, Zustand, Fastify (embedded API), SQLite (better-sqlite3 + Drizzle ORM)
- **Repo**: `lukac-michal/iDashboard` on branch `claude/plan-data-collection-app-c54uy`

## Architecture

```
src/
  main/           # Electron main process
    api/           # Fastify REST API (port 19280)
    config/        # YAML config loading (~/.idashboard/)
    connectors/    # External tool connectors (Claude Code, GitHub, etc.)
    db/            # Drizzle ORM schema + migrations
    ipc/           # IPC channel handlers
    services/      # Core services (AgentRegistry, AgentLifecycle, etc.)
    window/        # Window management, tray
  preload/        # Electron preload bridge
  renderer/       # React UI
    components/    # React components (panels, widgets)
    hooks/         # Custom React hooks
    store/         # Zustand stores
    styles/        # Tailwind CSS
  shared/         # Types and constants shared between main/renderer
resources/
  preambles/      # Agent preamble templates
  profiles/       # Agent profile definitions (16 profiles)
  hooks/          # Claude Code hook bridge script
tests/
  unit/           # Vitest unit tests
```

## Build & Test Commands

```bash
npm run dev              # Start in dev mode
npm run build            # Production build (electron-vite build)
npm test                 # Run unit tests (vitest)
npm run test:watch       # Watch mode tests
npm run typecheck        # TypeScript check (tsc --noEmit)
npm run lint             # ESLint
npm run package:mac      # Build + package for macOS
npx electron-rebuild -f -w better-sqlite3  # Rebuild native module
```

## Critical Rules

### Electron Process Safety

- **Main process** runs Node.js — never import renderer/React code here
- **Renderer process** is sandboxed — use IPC via preload bridge, never access Node APIs directly
- **Preload** exposes APIs via `contextBridge.exposeInMainWorld` — keep the surface minimal
- All IPC channels defined in `src/shared/ipc-channels.ts` — add new channels there
- Types shared between processes live in `src/shared/types.ts`

### Fastify API (Main Process)

- Embedded Fastify server on port 19280 — handles external events and agent reports
- Routes in `src/main/api/routes/` — use Fastify route plugin pattern
- Health check: `GET /api/v1/health`
- Events: `POST /api/v1/events` (from Claude Code hooks)
- Agent reports: `POST /api/v1/agent-report`

### Database (SQLite + Drizzle)

- DB path: `~/Library/Application Support/idashboard/idashboard.db`
- Schema in `src/main/db/` — use Drizzle ORM for all queries
- Migrations: `npm run db:generate` then `npm run db:migrate`
- **Never hand-write SQL** — use Drizzle query builder

### Config

- Main config: `~/.idashboard/config.yaml`
- Connectors: `~/.idashboard/connectors/*.yaml`
- Config loaded by `src/main/config/` — changes require app restart

### Experimental Mode (Multi-Agent Orchestration)

- Gated behind `config.experimental.enabled` toggle in Settings > Experimental
- Key services: `AgentRegistry`, `AgentLifecycleService`, `MasterAgentService`, `ITerm2Adapter`
- 16 agent profiles in `resources/profiles/`
- IPC channels: `agents:*`, `agent:*`, `agent-messages:*`, `master:*`

## Coding Standards

### TypeScript Conventions

- **PascalCase**: classes, interfaces, type aliases, React components, enums
- **camelCase**: variables, functions, parameters, object properties
- **SCREAMING_SNAKE_CASE**: constants
- **Interface prefix**: `I` prefix only when needed for clarity (prefer plain name)
- Use `const` by default, `let` only when reassignment needed
- Strict TypeScript — `strict: true` in tsconfig
- Prefer type inference where obvious, explicit types for function signatures and exports

### React Conventions

- Functional components only — no class components
- Zustand for state management — stores in `src/renderer/store/`
- Tailwind CSS for styling — no CSS modules or styled-components
- `lucide-react` for icons
- Prefer composition over prop drilling

### Testing

- **Vitest** for unit tests — files in `tests/unit/`
- **Playwright** for E2E — `npm run test:e2e`
- Test file naming: `{name}.test.ts` matching source file structure
- Use `vi.mock()` for mocking, `describe`/`it`/`expect` for assertions

### Logging

- Use structured console methods in main process: `console.log`, `console.warn`, `console.error`
- **NO emojis** in log messages — use plain text prefixes: `[API]`, `[IPC]`, `[AGENT]`, `[DB]`
- Include context: `console.log('[AGENT] Agent spawned:', { name, profile })`

## Post-Implementation Code Review

After completing any code implementation task, always spawn the `code-reviewer` subagent to review all changed files before reporting completion to the user. If critical issues are found, fix them before reporting.

## Branch & Commit Rules

- **Commit format**: Concise imperative mood message (e.g., "Add notification routing", "Fix agent spawn crash")
- Do NOT auto-rebuild — inform the user and let them rebuild manually
- Do NOT force push to main/master

## DON'T

- Don't import main-process modules in renderer or vice versa
- Don't access `electron` APIs directly from renderer — use preload bridge
- Don't use `any` type — use `unknown` and narrow, or define proper types
- Don't add emojis to code, logs, or messages
- Don't skip `CancellationToken` / `AbortSignal` propagation in async chains
- Don't use synchronous file I/O in main process hot paths (blocks UI)
- Don't commit `.env` files, secrets, or API keys
- Don't kill processes without explicit user approval
- Don't create unnecessary helper scripts for simple tasks
- Don't guess at parameter values — ask the user
