---
name: commit
description: Smart Git commit for iDashboard. Use when asked to commit changes, create a commit, or stage and commit files.
argument-hint: "[message | --amend]"
allowed-tools: Bash
---

# Smart Git Commit for iDashboard

Create well-formatted commits following project conventions: $ARGUMENTS

## Commit Message Format

```
<imperative mood message>
```

Examples from repository history:
- `Add menu bar mode, fix packaged app crash, update tray icon`
- `Remove global keyboard shortcuts to avoid stealing keys from other apps`
- `Add Slack bridge, channel logger, Windows-safe terminal layer, UI refinements`

## Instructions

1. **Check current state**: Run `git status` and `git diff --cached --stat` to see staged changes
2. **If no files staged**: Run `git diff --stat` to see unstaged changes, then stage appropriate files
3. **Analyze the diff**: Run `git diff --cached` to understand what's being committed
4. **Check for atomic commits**: If changes touch multiple unrelated concerns, suggest splitting into multiple commits
5. **Create commit message**:
   - Concise summary in imperative mood (under 72 characters)
   - If needed, add blank line and detailed description
   - End with `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` if Claude authored the changes
6. **Commit**: Use `git commit -m "..."` with the formatted message

## Guidelines for Splitting Commits

Consider splitting when changes include:
1. **Different concerns**: Unrelated parts of the codebase (main vs renderer vs tests)
2. **Different types**: Mixing features, fixes, refactoring, tests
3. **Large changes**: Would be clearer if broken down

## Command Arguments

- No arguments: Analyze changes and create appropriate commit
- `--amend`: Amend the previous commit
- `{message}`: Use provided message (e.g., `/commit add notification routing`)
