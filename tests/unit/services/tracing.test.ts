// ============================================================
// Tracing Service Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@main/utils/log', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Hoist mock functions so vi.mock factories can reference them
const { mockEnd, mockSetAttribute, mockSetStatus, mockStartSpan, mockRegister } = vi.hoisted(() => {
  const mockEnd = vi.fn();
  const mockSetAttribute = vi.fn();
  const mockSetStatus = vi.fn();
  const mockStartSpan = vi.fn().mockReturnValue({
    end: mockEnd,
    setAttribute: mockSetAttribute,
    setStatus: mockSetStatus,
  });
  const mockRegister = vi.fn();
  return { mockEnd, mockSetAttribute, mockSetStatus, mockStartSpan, mockRegister };
});

vi.mock('@arizeai/phoenix-otel', () => ({
  register: mockRegister,
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn().mockReturnValue({
      startSpan: mockStartSpan,
    }),
    setSpan: vi.fn().mockReturnValue({}),
  },
  context: {
    active: vi.fn().mockReturnValue({}),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

import {
  initTracing,
  isTracingEnabled,
  traceTaskCreated,
  traceTaskClaimed,
  traceTaskDispatched,
  traceTaskCompleted,
  traceAgentReport,
  traceMessage,
  shutdownTracing,
} from '@main/services/tracing';

describe('Tracing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await shutdownTracing();
  });

  describe('initTracing', () => {
    it('initializes with Phoenix URL', async () => {
      const result = await initTracing('http://localhost:6006');
      expect(result).toBe(true);
      expect(isTracingEnabled()).toBe(true);
      expect(mockRegister).toHaveBeenCalledWith({
        projectName: 'idashboard',
        collectorEndpoint: 'http://localhost:6006',
      });
    });

    it('accepts custom project name', async () => {
      await initTracing('http://localhost:6006', 'my-project');
      expect(mockRegister).toHaveBeenCalledWith({
        projectName: 'my-project',
        collectorEndpoint: 'http://localhost:6006',
      });
    });

    it('returns false on init failure', async () => {
      mockRegister.mockImplementationOnce(() => { throw new Error('Connection refused'); });
      const result = await initTracing('http://bad-host:6006');
      expect(result).toBe(false);
      expect(isTracingEnabled()).toBe(false);
    });
  });

  describe('traceTaskCreated', () => {
    it('creates a span with task attributes', async () => {
      await initTracing('http://localhost:6006');
      traceTaskCreated('task-1', 'Build login page', 'user', 'Architect');

      expect(mockStartSpan).toHaveBeenCalledWith('task.created', {
        attributes: {
          'task.id': 'task-1',
          'task.title': 'Build login page',
          'task.created_by': 'user',
          'task.assigned_to': 'Architect',
          'task.status': 'pending',
        },
      });
    });

    it('is a no-op when tracing disabled', () => {
      traceTaskCreated('task-1', 'test', 'user');
      expect(mockStartSpan).not.toHaveBeenCalled();
    });
  });

  describe('traceTaskClaimed', () => {
    it('creates a child span', async () => {
      await initTracing('http://localhost:6006');
      traceTaskCreated('task-1', 'test', 'user');
      mockStartSpan.mockClear();

      traceTaskClaimed('task-1', 'Implementer');

      expect(mockStartSpan).toHaveBeenCalledWith(
        'task.claimed',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'task.id': 'task-1',
            'agent.name': 'Implementer',
          }),
        }),
        expect.anything(),
      );
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('traceTaskDispatched', () => {
    it('creates a child span for dispatch', async () => {
      await initTracing('http://localhost:6006');
      traceTaskCreated('task-1', 'test', 'user');
      mockStartSpan.mockClear();

      traceTaskDispatched('task-1', 'Implementer');

      expect(mockStartSpan).toHaveBeenCalledWith(
        'task.dispatched',
        expect.objectContaining({
          attributes: expect.objectContaining({
            'task.id': 'task-1',
            'agent.name': 'Implementer',
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe('traceTaskCompleted', () => {
    it('ends the parent task span with OK status', async () => {
      await initTracing('http://localhost:6006');
      traceTaskCreated('task-1', 'test', 'user');

      traceTaskCompleted('task-1', 'Implementer', 'Done building');

      expect(mockSetAttribute).toHaveBeenCalledWith('task.status', 'completed');
      expect(mockSetAttribute).toHaveBeenCalledWith('task.completed_by', 'Implementer');
      expect(mockSetStatus).toHaveBeenCalledWith({ code: 1 });
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('traceAgentReport', () => {
    it('starts a span for working status', async () => {
      await initTracing('http://localhost:6006');
      traceAgentReport('Architect', 'working', 'Analyzing codebase');

      expect(mockStartSpan).toHaveBeenCalledWith('agent.working', {
        attributes: {
          'agent.name': 'Architect',
          'agent.status': 'working',
          'agent.summary': 'Analyzing codebase',
        },
      });
    });

    it('ends span on done status', async () => {
      await initTracing('http://localhost:6006');
      traceAgentReport('Architect', 'working', 'Analyzing');
      mockEnd.mockClear();

      traceAgentReport('Architect', 'done', 'Analysis complete');

      expect(mockSetAttribute).toHaveBeenCalledWith('agent.status', 'done');
      expect(mockSetStatus).toHaveBeenCalledWith({ code: 1 });
      expect(mockEnd).toHaveBeenCalled();
    });

    it('sets error status on error report', async () => {
      await initTracing('http://localhost:6006');
      traceAgentReport('Impl', 'working', 'Building');
      traceAgentReport('Impl', 'error', 'Build failed');

      expect(mockSetStatus).toHaveBeenCalledWith({ code: 2, message: 'Build failed' });
    });

    it('creates standalone span when no working span exists', async () => {
      await initTracing('http://localhost:6006');
      mockStartSpan.mockClear();

      traceAgentReport('NewAgent', 'done', 'Finished');

      expect(mockStartSpan).toHaveBeenCalledWith('agent.done', expect.anything());
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('traceMessage', () => {
    it('creates a span with message attributes', async () => {
      await initTracing('http://localhost:6006');
      traceMessage('PM', 'Architect', 'Design the auth system');

      expect(mockStartSpan).toHaveBeenCalledWith('agent.message', {
        attributes: {
          'message.from': 'PM',
          'message.to': 'Architect',
          'message.body_preview': 'Design the auth system',
        },
      });
      expect(mockEnd).toHaveBeenCalled();
    });
  });

  describe('shutdownTracing', () => {
    it('ends all active spans and resets state', async () => {
      await initTracing('http://localhost:6006');
      traceTaskCreated('task-1', 'test', 'user');
      traceAgentReport('Agent1', 'working', 'busy');

      expect(isTracingEnabled()).toBe(true);

      await shutdownTracing();

      expect(isTracingEnabled()).toBe(false);
      expect(mockEnd).toHaveBeenCalled();
    });
  });
});
