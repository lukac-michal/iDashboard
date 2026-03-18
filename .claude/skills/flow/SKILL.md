---
name: flow
description: Multi-agent development workflow orchestrator. Use when starting a new feature, bug fix, or refactoring task. Chains architect, planner, reviewer, skeptic analysis into an approved plan, then hands off to implementation. Invoke with /flow "task description".
argument-hint: '"task description". Flags: --full, --fast, --minimal to override mode. Use "resume" or "resume TASK_XXX" to resume an interrupted workflow.'
---

# Flow Orchestrator

Multi-agent development workflow. Execute the following steps **in order**. Carry data forward between steps.

Arguments: $ARGUMENTS

---

## State Management

Persist state after each step to `.tasks/TASK_XXX/` directories for resume support.

```
.tasks/
  .active_task              # Current task ID
  TASK_001/
    state.json              # Workflow state
    task.md                 # Original task description
    architect.md            # Architect output
    planner.md              # Planner output
    plan-reviewer.md        # Plan reviewer output
    skeptic.md              # Skeptic output
    code-reviewer.md        # Code reviewer output
```

---

## Step 1: Parse Input & Load Config

### 1-pre. Check for Resume

If `$ARGUMENTS` starts with `resume`: read `.tasks/.active_task` or use provided task ID. Restore state from `.tasks/{task_id}/state.json` and jump to `current_step`.

### 1a. Load Workflow Config

Read `.claude/workflow-config.yaml`. If missing, use defaults: `mode: full`, all agents.

### 1b. Parse Task Description

Check for mode flags (`--full`, `--fast`, `--minimal`). Remainder is the task description.

### 1c. Resolve Workflow Mode

Priority: CLI flag > config `mode` field > auto-detection (keyword matching).

### 1d. Announce

> Workflow mode: **{mode}**
> Agents: {list}
> Task: {description}

### 1e. Initialize Task State

Create `.tasks/{task_id}/` directory and `state.json`.

---

## Step 2: Dispatch Architect

**Guard: If `architect` NOT in active_agents, skip to Step 3.**

Dispatch architect subagent with task description. Present summary to user.

---

## Step 3: Dispatch Planner

Dispatch planner subagent with task description + architect analysis. Planner writes plan to `docs/plans/YYYY-MM-DD-<topic>.md`.

---

## Step 4: Dispatch Plan Reviewer

**Guard: If `plan-reviewer` NOT in active_agents, skip to Step 5.**

Dispatch plan-reviewer. If REVISE: re-dispatch planner with issues, then re-review. Max `max_plan_revisions` cycles.

---

## Step 5: Dispatch Skeptic

**Guard: If `skeptic` NOT in active_agents, skip to Step 6.**

Dispatch skeptic to stress-test the plan. Note Critical/High concerns.

---

## Step 6: Human Checkpoint

**Guard: If `checkpoints.after_plan` is false, auto-approve.**

Present plan summary + skeptic concerns. Ask user:
> 1. **Approve** — proceed
> 2. **Revise** — provide feedback (loops to Step 3)
> 3. **Abort** — stop

---

## Step 7: Create Feature Branch

```bash
git checkout -b "feature/<short-kebab-description>"
```

---

## Step 8: Implementation

If `loop_mode.enabled`: implement with verification loop.

For each plan task:
1. Dispatch implementer subagent
2. Run verification: `npm test && npx tsc --noEmit`
3. **PASS**: commit and continue. **FAIL**: retry with error context.
4. After `try_different_approach_after` failures: try fundamentally different approach.
5. After `escalate_after` failures: ask user for guidance.

Otherwise: invoke `superpowers:subagent-driven-development`.

---

## Step 9: Final Code Review

**Guard: If `code-reviewer` NOT in active_agents, skip to Step 10.**

Dispatch code-reviewer on all changes (`git diff main...HEAD`). If critical issues + `checkpoints.on_critical_review`: ask user before proceeding.

---

## Step 10: Finish

**Guard: If `checkpoints.before_commit` is true, ask user.**

Invoke `superpowers:finishing-a-development-branch`.

Update state to complete. Delete `.tasks/.active_task`.

---

## Error Handling

At any step, if a subagent fails: present error to user and offer Retry / Skip / Abort.

## Data Flow

| Variable | Set in | Used in |
|---|---|---|
| Task description | Step 1 | All steps |
| active_mode | Step 1 | Steps 1-6 |
| Architect analysis | Step 2 | Steps 3, 4 |
| Plan file path | Step 3 | Steps 4-9 |
| Skeptic concerns | Step 5 | Step 6 |
| Feature branch | Step 7 | Steps 8-10 |
