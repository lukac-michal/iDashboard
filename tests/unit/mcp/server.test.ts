// ============================================================
// MCP Server Tool Handler Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleReportStatus,
  handleListAgents,
  handleCreateTask,
  handleClaimTask,
  handleCompleteTask,
  handleGetTasks,
  handleSendMessage,
} from '@main/mcp/server';

// Mock global fetch
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

describe('handleReportStatus', () => {
  it('calls POST /api/v1/agent-report with correct body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, agentId: 'a1' }));

    const result = await handleReportStatus({
      agentName: 'TestAgent',
      status: 'working',
      summary: 'Building feature',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:19280/api/v1/agent-report',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          agentName: 'TestAgent',
          status: 'working',
          shortSummary: 'Building feature',
          longSummary: undefined,
        }),
      }),
    );
    expect(result.content[0].text).toContain('Status reported: working');
  });

  it('includes longSummary when provided', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await handleReportStatus({
      agentName: 'TestAgent',
      status: 'done',
      summary: 'Finished',
      longSummary: 'Detailed description of work done',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.longSummary).toBe('Detailed description of work done');
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404));

    await expect(
      handleReportStatus({
        agentName: 'Unknown',
        status: 'working',
        summary: 'test',
      }),
    ).rejects.toThrow('API error 404');
  });
});

describe('handleListAgents', () => {
  it('calls GET /api/v1/agents', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { name: 'Agent1', status: 'online', reportStatus: 'working', shortSummary: 'Coding' },
        { name: 'Agent2', status: 'stale' },
      ]),
    );

    const result = await handleListAgents();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:19280/api/v1/agents',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.content[0].text).toContain('Agent1');
    expect(result.content[0].text).toContain('(working)');
    expect(result.content[0].text).toContain('Coding');
    expect(result.content[0].text).toContain('Agent2');
  });

  it('returns message when no agents', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    const result = await handleListAgents();
    expect(result.content[0].text).toBe('No agents registered.');
  });

  it('handles API failure gracefully', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 503));

    const result = await handleListAgents();
    expect(result.content[0].text).toContain('Failed to list agents');
  });
});

describe('handleCreateTask', () => {
  it('calls POST /api/v1/tasks with correct body', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ok: true, task: { id: 'task-1' } }),
    );

    const result = await handleCreateTask({
      title: 'Fix bug',
      createdBy: 'mcp-agent',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:19280/api/v1/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Fix bug',
          createdBy: 'mcp-agent',
          assignTo: undefined,
          blockedBy: undefined,
        }),
      }),
    );
    expect(result.content[0].text).toContain('task-1');
    expect(result.content[0].text).toContain('Fix bug');
  });

  it('passes assignTo and blockedBy', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ok: true, task: { id: 'task-2' } }),
    );

    await handleCreateTask({
      title: 'Deploy',
      createdBy: 'pm',
      assignTo: 'DevAgent',
      blockedBy: ['task-1'],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.assignTo).toBe('DevAgent');
    expect(body.blockedBy).toEqual(['task-1']);
  });
});

describe('handleClaimTask', () => {
  it('calls PATCH /api/v1/tasks/:id with in_progress status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, task: { id: 'task-1' } }));

    const result = await handleClaimTask({ taskId: 'task-1', agentName: 'DevAgent' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:19280/api/v1/tasks/task-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress', assignedTo: 'DevAgent' }),
      }),
    );
    expect(result.content[0].text).toContain('claimed by DevAgent');
  });

  it('handles failure to claim', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Cannot claim task' }, 409));

    const result = await handleClaimTask({ taskId: 'task-1', agentName: 'DevAgent' });
    expect(result.content[0].text).toContain('Failed to claim task');
  });
});

describe('handleCompleteTask', () => {
  it('calls PATCH /api/v1/tasks/:id with completed status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await handleCompleteTask({ taskId: 'task-1', result: 'All done' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:19280/api/v1/tasks/task-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', result: 'All done' }),
      }),
    );
    expect(result.content[0].text).toContain('task-1 completed');
  });

  it('handles failure', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Task not found' }, 404));

    const result = await handleCompleteTask({ taskId: 'bad-id' });
    expect(result.content[0].text).toContain('Failed to complete task');
  });
});

describe('handleGetTasks', () => {
  it('calls GET /api/v1/tasks without filters', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { id: 't1', title: 'Task 1', status: 'pending' },
        { id: 't2', title: 'Task 2', status: 'in_progress', assignedTo: 'DevAgent' },
      ]),
    );

    const result = await handleGetTasks({});

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:19280/api/v1/tasks',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.content[0].text).toContain('[pending] t1: Task 1');
    expect(result.content[0].text).toContain('(DevAgent)');
  });

  it('passes status and assignedTo as query params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    await handleGetTasks({ status: 'pending', assignedTo: 'DevAgent' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('status=pending');
    expect(calledUrl).toContain('assignedTo=DevAgent');
  });

  it('returns message when no tasks', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    const result = await handleGetTasks({});
    expect(result.content[0].text).toBe('No tasks found.');
  });
});

describe('handleSendMessage', () => {
  it('calls POST /api/v1/messages with correct body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await handleSendMessage({
      from: 'AgentA',
      to: 'AgentB',
      body: 'Hello there',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:19280/api/v1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ from: 'AgentA', to: 'AgentB', body: 'Hello there' }),
      }),
    );
    expect(result.content[0].text).toContain('Message sent from AgentA to AgentB');
  });
});
