---
name: help
description: Show available Claude Code commands and tips for working effectively with Claude in the iDashboard repo.
---

Print the following guide to the user:

---

# iDashboard — Claude Code Quick Reference

## Available Commands

| Category | Command | Description |
|----------|---------|-------------|
| **Development Workflow** | `/flow "task"` | Full orchestrated workflow: architect, plan, review, then implement |
| | `/commit [message]` | Create properly formatted commits |
| | `/review [files\|PR]` | Code review for bugs, security issues, and quality problems |
| | `/pr [base-branch]` | Create a PR with auto-generated change report |
| | `/change-report` | Generate structured change report for current branch |
| **Meta** | `/help` | This guide |
| | `/skill-creator` | Guide for creating new skills |

## Build & Test

```bash
npm run dev              # Start dev mode
npm test                 # Run unit tests
npm run typecheck        # TypeScript check
npm run lint             # ESLint
npm run build            # Production build
npm run package:mac      # Build + package macOS app
```

## Working Effectively with Claude

- **Plan mode** — Press `shift+tab` to toggle plan mode for non-trivial tasks. Claude explores the codebase and proposes a plan before writing code.
- **Be specific** — Include file paths, error messages, or component names when asking for help.
- **Iterative workflow** — Start with `/flow "task"` for full orchestrated workflows, or use plan mode + implement for simpler tasks.
- **Code review** — Claude auto-reviews after implementation. Use `/review` to trigger manually.
- **Quick actions** — For simple fixes, just describe what you need — no special commands required.

## Key Files

| File | Purpose |
|------|---------|
| `src/main/index.ts` | Electron main entry point |
| `src/main/api/server.ts` | Fastify API server setup |
| `src/main/services/agent-registry.ts` | Agent tracking and state |
| `src/main/services/agent-lifecycle.ts` | Agent spawn and terminal integration |
| `src/renderer/App.tsx` | React app root |
| `src/shared/types.ts` | Shared type definitions |
| `src/shared/ipc-channels.ts` | IPC channel constants |
| `~/.idashboard/config.yaml` | Runtime configuration |
