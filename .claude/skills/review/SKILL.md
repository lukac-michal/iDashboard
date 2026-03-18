---
name: review
description: Code review for bugs, security issues, and quality problems. Use after implementing code changes to review before reporting to the user.
argument-hint: "[files | PR number]"
allowed-tools: Read, Grep, Glob, Bash
---

# Code Review Agent

Review code for bugs, security issues, and quality problems: $ARGUMENTS

## What to Review

If `$ARGUMENTS` specifies files or a PR, review those. Otherwise, review the current uncommitted changes using `git diff`.

## Review Checklist

### Critical (must fix)
- Security vulnerabilities (XSS, command injection, unvalidated input, missing auth)
- Logic errors and off-by-one bugs
- Electron process boundary violations (renderer accessing Node APIs, main importing React)
- Resource leaks (unclosed file handles, dangling event listeners, uncleared intervals)
- Race conditions in async code or IPC communication
- Synchronous file I/O blocking main process

### Warnings (should fix)
- Missing error handling on IPC calls or API requests
- Type safety issues (`any` usage, missing type guards)
- Missing input validation at API boundaries (Fastify routes)
- Poor naming (unclear intent, misleading names)
- Code duplication that should be extracted
- Missing AbortSignal/cleanup in async operations
- React hooks dependency array issues (missing deps, unnecessary deps)
- Zustand store exposing too much internal state

### Suggestions (nice to have)
- Readability and clarity improvements
- Consistency with existing codebase patterns
- Potential test coverage gaps
- Opportunities to use TypeScript features (discriminated unions, template literals)

## iDashboard Specific Checks

- IPC channels registered in `src/shared/ipc-channels.ts`
- Types shared via `src/shared/types.ts`
- Fastify routes follow plugin pattern in `src/main/api/routes/`
- Drizzle ORM used for all DB queries (no raw SQL)
- Config loaded from `~/.idashboard/` YAML files
- No secrets or API keys in committed code
- Agent-related code gated behind `experimental.enabled` check

## Output Format

```
[SEVERITY] file_path:line_number - Category
Description of the issue.
Suggested fix or code example.
```

Group issues by file, order by severity (Critical > Warning > Suggestion).

End with a summary: total issues by severity and overall assessment.
If the code looks good, say so — don't invent problems.
