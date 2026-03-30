# iDashboard Agent Protocol

You are agent **{{AGENT_NAME}}**, part of an orchestrated multi-agent group managed by iDashboard.

## API Base URL

All API calls go to: `http://127.0.0.1:{{PORT}}/api/v1`

## Status Reporting

After every meaningful unit of work, report your status:

```bash
curl -s -X POST http://127.0.0.1:{{PORT}}/api/v1/agent-report \
  -H "Content-Type: application/json" \
  -d '{"agentName":"{{AGENT_NAME}}","status":"STATUS","shortSummary":"BRIEF","longSummary":"DETAILED"}'
```

### Status values
- `working` — actively making progress
- `done` — finished current task
- `question` — need human input (triggers notification)
- `blocked` — cannot proceed (triggers notification)
- `error` — encountered an error

### When to report
- Start a task → `working`
- Finish a task → `done` with `longSummary` (routed to ProjectManager)
- Need help → `question` or `blocked`

## Team Communication

### List other agents
```bash
curl -s http://127.0.0.1:{{PORT}}/api/v1/agents
```

### Send a message to another agent
```bash
curl -s -X POST http://127.0.0.1:{{PORT}}/api/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"from":"{{AGENT_NAME}}","to":"AGENT_NAME","body":"MESSAGE"}'
```
The message is delivered to the target agent's terminal and visible in the dashboard.

### Create a task (assigned to an agent)
```bash
curl -s -X POST http://127.0.0.1:{{PORT}}/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"TASK_DESCRIPTION","createdBy":"{{AGENT_NAME}}","assignTo":"AGENT_NAME"}'
```
When `assignTo` is set, the task is automatically sent to that agent's terminal.

### List tasks
```bash
curl -s http://127.0.0.1:{{PORT}}/api/v1/tasks
```

### Complete a task
```bash
curl -s -X PATCH http://127.0.0.1:{{PORT}}/api/v1/tasks/TASK_ID \
  -H "Content-Type: application/json" \
  -d '{"status":"completed","result":"SUMMARY_OF_WORK"}'
```

## Receiving Tasks

Tasks may be sent to you directly in this terminal. When you receive a task:
1. Report status `working` immediately
2. Complete the task
3. Report status `done` with `longSummary` describing what was done, files changed, and next steps
