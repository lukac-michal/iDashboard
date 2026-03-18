---
name: change-report
description: Generate a structured change report for the current branch, suitable for a pull request description.
---

# Change Report Generation

Generate a structured change report for the current branch.

## Workflow

### 1. Verify Clean Working Tree

Run `git status --porcelain`. If uncommitted changes exist, **stop and report**.

### 2. Determine Base Branch

Use `main` or the default branch unless explicitly overridden.

### 3. Gather Branch Changes

```bash
git diff {base}...HEAD --stat
git log {base}..HEAD --oneline
```

If no commits ahead, **stop and report**.

### 4. Analyze and Categorize Changes

Read the diff (`git diff {base}...HEAD`) and categorize:

| Category | When to use |
|----------|-------------|
| **New Features** | New endpoints, services, components, functionality |
| **Bug Fixes** | Corrections to existing behavior |
| **Refactoring** | Code restructuring without behavior change |
| **Configuration / Infrastructure** | Config, build, CI/CD, dependency changes |

### 5. Generate PR Description

Use the template from `references/pr-template.md`:
- Write a concise summary
- Only include categories with actual changes
- Each bullet should be clear and specific

### 6. Create PR Title

Format: `{imperative mood summary}` — under 70 characters.

### 7. Return Result

Return the PR title and body for the `/pr` skill to use.

## Rules

- Never include empty change categories
- PR title uses imperative mood ("Add", "Fix", "Update", "Refactor")
- Keep descriptions specific and actionable
