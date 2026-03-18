---
name: pr
description: Create a pull request from the current branch. Analyzes all commits, generates a structured change report, and opens the PR. Use when asked to "create a PR", "open a pull request", or "submit for review".
argument-hint: "[base-branch]"
allowed-tools: Bash
---

# Create Pull Request

Create a pull request for the current feature branch with an auto-generated change report.

## Arguments

- `$ARGUMENTS` — optional base branch override (default: `main` or the default branch)

## Steps

1. **Determine base branch**: Use `$ARGUMENTS` if provided, otherwise detect with `git remote show origin | grep 'HEAD branch'`.

2. **Invoke the change-report workflow**: Follow the `/change-report` skill:
   - Verify no uncommitted changes
   - Gather all branch changes via `git diff` and `git log`
   - Analyze and categorize changes
   - Generate structured PR description

3. **Ensure branch is pushed**: Run `git push -u origin HEAD` if no upstream tracking branch.

4. **Create the PR**:
   ```bash
   gh pr create --base {base-branch} --title "{summary}" --body "$(cat <<'EOF'
   {generated body}
   EOF
   )"
   ```

5. **Report the PR link** back to the user.

## Error Handling

- Uncommitted changes: warn and stop
- No commits ahead of base: inform user
- `gh` CLI fails: show error and suggest `gh auth status`
