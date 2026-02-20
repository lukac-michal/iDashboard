// ============================================================
// Webhook Receiver Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { WebhookReceiver } from '@main/connectors/webhook-receiver';

describe('WebhookReceiver', () => {
  describe('GitHub signature verification', () => {
    const secret = 'test-secret-123';
    const receiver = new WebhookReceiver({
      source: 'github',
      secret,
      connectorId: 'wh-github',
      displayName: 'GitHub Webhooks',
    });

    it('accepts valid HMAC-SHA256 signature', () => {
      const body = JSON.stringify({ action: 'completed', repository: { full_name: 'org/repo' } });
      const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

      const result = receiver.verifySignature(
        { headers: { 'x-hub-signature-256': sig }, body: JSON.parse(body), source: 'github' },
        body,
      );

      expect(result).toBe(true);
    });

    it('rejects invalid signature', () => {
      const body = '{"test": true}';
      const result = receiver.verifySignature(
        { headers: { 'x-hub-signature-256': 'sha256=invalid' }, body: {}, source: 'github' },
        body,
      );

      expect(result).toBe(false);
    });

    it('rejects missing signature', () => {
      const result = receiver.verifySignature(
        { headers: {}, body: {}, source: 'github' },
        '{}',
      );

      expect(result).toBe(false);
    });
  });

  describe('GitLab signature verification', () => {
    const receiver = new WebhookReceiver({
      source: 'gitlab',
      secret: 'gl-secret',
      connectorId: 'wh-gitlab',
      displayName: 'GitLab',
    });

    it('accepts matching token', () => {
      const result = receiver.verifySignature(
        { headers: { 'x-gitlab-token': 'gl-secret' }, body: {}, source: 'gitlab' },
        '{}',
      );
      expect(result).toBe(true);
    });

    it('rejects wrong token', () => {
      const result = receiver.verifySignature(
        { headers: { 'x-gitlab-token': 'wrong' }, body: {}, source: 'gitlab' },
        '{}',
      );
      expect(result).toBe(false);
    });
  });

  describe('Generic signature verification', () => {
    it('accepts when no secret configured', () => {
      const receiver = new WebhookReceiver({
        source: 'generic',
        connectorId: 'wh-generic',
        displayName: 'Generic',
      });

      const result = receiver.verifySignature(
        { headers: {}, body: {}, source: 'generic' },
        '{}',
      );
      expect(result).toBe(true);
    });
  });

  describe('GitHub payload parsing', () => {
    const receiver = new WebhookReceiver({
      source: 'github',
      connectorId: 'wh-github',
      displayName: 'GitHub',
    });

    it('parses workflow_run event', () => {
      const events = receiver.parsePayload({
        headers: { 'x-github-event': 'workflow_run' },
        body: {
          action: 'completed',
          workflow_run: { name: 'CI', conclusion: 'failure' },
          repository: { full_name: 'org/repo' },
        },
        source: 'github',
      });

      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe('error');
      expect(events[0].title).toContain('org/repo');
      expect(events[0].title).toContain('CI');
    });

    it('parses push event', () => {
      const events = receiver.parsePayload({
        headers: { 'x-github-event': 'push' },
        body: {
          ref: 'refs/heads/main',
          pusher: { name: 'dev123' },
          repository: { full_name: 'org/repo' },
        },
        source: 'github',
      });

      expect(events).toHaveLength(1);
      expect(events[0].title).toContain('push to main');
      expect(events[0].title).toContain('dev123');
    });

    it('respects event filter', () => {
      const filtered = new WebhookReceiver({
        source: 'github',
        connectorId: 'wh-github-filtered',
        displayName: 'GitHub Filtered',
        eventFilter: ['workflow_run'],
      });

      const events = filtered.parsePayload({
        headers: { 'x-github-event': 'push' },
        body: { ref: 'refs/heads/main', pusher: { name: 'x' }, repository: { full_name: 'o/r' } },
        source: 'github',
      });

      expect(events).toHaveLength(0);
    });
  });

  describe('PagerDuty payload parsing', () => {
    const receiver = new WebhookReceiver({
      source: 'pagerduty',
      connectorId: 'wh-pd',
      displayName: 'PagerDuty',
    });

    it('parses incident.triggered', () => {
      const events = receiver.parsePayload({
        headers: {},
        body: {
          event: {
            event_type: 'incident.triggered',
            data: { title: 'Server down' },
          },
        },
        source: 'pagerduty',
      });

      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe('critical');
      expect(events[0].title).toBe('Server down');
    });

    it('parses incident.resolved', () => {
      const events = receiver.parsePayload({
        headers: {},
        body: {
          event: {
            event_type: 'incident.resolved',
            data: { title: 'Server restored' },
          },
        },
        source: 'pagerduty',
      });

      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe('info');
    });
  });
});
