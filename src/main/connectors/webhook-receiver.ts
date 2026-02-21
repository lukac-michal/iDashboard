// ============================================================
// Webhook Receiver - Inbound webhook handler with signature verification
// Supports GitHub, GitLab, Bitbucket, PagerDuty, generic
// ============================================================

import * as crypto from 'node:crypto';
import type { ConnectorEvent, WebhookPayload } from '@shared/types';
import type { WebhookSource } from '@shared/constants';

export interface WebhookReceiverConfig {
  source: WebhookSource;
  secret?: string;
  eventFilter?: string[];
  severityMapping?: Record<string, string>;
  connectorId: string;
  displayName: string;
}

export class WebhookReceiver {
  constructor(private config: WebhookReceiverConfig) {}

  /** Verify the webhook signature */
  verifySignature(payload: WebhookPayload, rawBody: string): boolean {
    if (!this.config.secret) return true; // No secret configured = accept all

    switch (this.config.source) {
      case 'github':
        return this.verifyGitHub(payload.headers, rawBody);
      case 'gitlab':
        return this.verifyGitLab(payload.headers);
      case 'bitbucket':
        return this.verifyBitbucket(payload.headers, rawBody);
      case 'pagerduty':
        return this.verifyPagerDuty(payload.headers, rawBody);
      case 'generic':
        return this.verifyGeneric(payload.headers);
      default:
        return false;
    }
  }

  /** Parse the webhook payload into connector events */
  parsePayload(payload: WebhookPayload): ConnectorEvent[] {
    switch (this.config.source) {
      case 'github':
        return this.parseGitHub(payload);
      case 'gitlab':
        return this.parseGitLab(payload);
      case 'pagerduty':
        return this.parsePagerDuty(payload);
      default:
        return this.parseGeneric(payload);
    }
  }

  // --- GitHub ---

  private verifyGitHub(headers: Record<string, string>, rawBody: string): boolean {
    const signature = headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'];
    if (!signature) return false;

    const expected = 'sha256=' + crypto
      .createHmac('sha256', this.config.secret!)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  private parseGitHub(payload: WebhookPayload): ConnectorEvent[] {
    const event = payload.headers['x-github-event'] ?? payload.headers['X-GitHub-Event'] ?? 'unknown';
    const body = payload.body as Record<string, unknown>;

    if (this.config.eventFilter?.length && !this.config.eventFilter.includes(event)) {
      return [];
    }

    const action = body.action as string | undefined;
    const repo = (body.repository as Record<string, unknown>)?.full_name as string ?? 'unknown';

    let title: string;
    let severity: ConnectorEvent['severity'] = 'info';
    let eventStatus: string | undefined;

    switch (event) {
      case 'workflow_run': {
        const run = body.workflow_run as Record<string, unknown> | undefined;
        const conclusion = run?.conclusion as string;
        title = `${repo}: ${run?.name ?? 'workflow'} (${action})`;
        severity = conclusion === 'failure' ? 'error'
          : conclusion === 'success' ? 'info' : 'warning';
        eventStatus = conclusion === 'success' ? 'success'
          : conclusion === 'failure' ? 'failure' : 'in_progress';
        break;
      }
      case 'push': {
        const pusher = (body.pusher as Record<string, unknown>)?.name ?? 'unknown';
        const ref = body.ref as string ?? '';
        const branch = ref.replace('refs/heads/', '');
        title = `${repo}: push to ${branch} by ${pusher}`;
        break;
      }
      case 'pull_request': {
        const pr = body.pull_request as Record<string, unknown> | undefined;
        title = `${repo}: PR #${body.number} ${action} — ${pr?.title ?? ''}`;
        break;
      }
      default:
        title = `${repo}: ${event}${action ? ` (${action})` : ''}`;
    }

    // Apply custom severity mapping
    const mappingKey = eventStatus ? `${action}.${eventStatus}` : action;
    if (mappingKey && this.config.severityMapping?.[mappingKey]) {
      severity = this.config.severityMapping[mappingKey] as ConnectorEvent['severity'];
    }

    return [this.createEvent(title, severity, event, eventStatus, body)];
  }

  // --- GitLab ---

  private verifyGitLab(headers: Record<string, string>): boolean {
    const token = headers['x-gitlab-token'] ?? headers['X-Gitlab-Token'];
    return token === this.config.secret;
  }

  private parseGitLab(payload: WebhookPayload): ConnectorEvent[] {
    const body = payload.body as Record<string, unknown>;
    const kind = body.object_kind as string ?? 'unknown';
    const project = (body.project as Record<string, unknown>)?.path_with_namespace as string ?? 'unknown';

    if (this.config.eventFilter?.length && !this.config.eventFilter.includes(kind)) {
      return [];
    }

    let title = `${project}: ${kind}`;
    let severity: ConnectorEvent['severity'] = 'info';

    if (kind === 'pipeline') {
      const status = (body.object_attributes as Record<string, unknown>)?.status as string;
      severity = status === 'failed' ? 'error' : status === 'success' ? 'info' : 'warning';
      title = `${project}: pipeline ${status}`;
    }

    return [this.createEvent(title, severity, kind, undefined, body)];
  }

  // --- PagerDuty ---

  private verifyPagerDuty(headers: Record<string, string>, rawBody: string): boolean {
    const signature = headers['x-pagerduty-signature'] ?? headers['X-PagerDuty-Signature'];
    if (!signature) return false;

    // PagerDuty v3 uses multiple signatures separated by commas
    const sigs = signature.split(',').map(s => s.trim());
    const expected = 'v1=' + crypto
      .createHmac('sha256', this.config.secret!)
      .update(rawBody)
      .digest('hex');

    const expBuf = Buffer.from(expected);
    return sigs.some(sig => {
      const sigBuf = Buffer.from(sig);
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    });
  }

  private parsePagerDuty(payload: WebhookPayload): ConnectorEvent[] {
    const body = payload.body as Record<string, unknown>;
    const event = body.event as Record<string, unknown> | undefined;
    const eventType = event?.event_type as string ?? 'unknown';

    if (this.config.eventFilter?.length && !this.config.eventFilter.includes(eventType)) {
      return [];
    }

    const data = event?.data as Record<string, unknown> | undefined;
    const title = (data?.title as string) ?? `PagerDuty: ${eventType}`;
    const severity: ConnectorEvent['severity'] =
      eventType.includes('triggered') ? 'critical'
      : eventType.includes('escalated') ? 'error'
      : 'info';

    return [this.createEvent(title, severity, eventType, undefined, body)];
  }

  // --- Bitbucket ---

  private verifyBitbucket(headers: Record<string, string>, rawBody: string): boolean {
    // Bitbucket Cloud does not support HMAC signatures by default.
    // If a secret is configured, verify using the shared secret as a bearer token
    // sent in the X-Hub-Signature header (Bitbucket Server uses this pattern).
    const signature = headers['x-hub-signature'] ?? headers['X-Hub-Signature'];
    if (!signature) {
      // Fallback: check for a shared secret header (Bitbucket Server webhook secret)
      const token = headers['x-webhook-secret'] ?? headers['X-Webhook-Secret'];
      return !this.config.secret || token === this.config.secret;
    }

    const expected = 'sha256=' + crypto
      .createHmac('sha256', this.config.secret!)
      .update(rawBody)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  // --- Generic ---

  private verifyGeneric(headers: Record<string, string>): boolean {
    const secret = headers['x-webhook-secret'] ?? headers['X-Webhook-Secret'];
    return !this.config.secret || secret === this.config.secret;
  }

  private parseGeneric(payload: WebhookPayload): ConnectorEvent[] {
    const body = payload.body as Record<string, unknown>;
    const title = (body.title as string) ?? (body.message as string) ?? 'Webhook event';
    const severity = (body.severity as ConnectorEvent['severity']) ?? 'info';

    return [this.createEvent(title, severity, 'webhook', undefined, body)];
  }

  // --- Helper ---

  private createEvent(
    title: string,
    severity: ConnectorEvent['severity'],
    eventType: string,
    status: string | undefined,
    raw: unknown,
  ): ConnectorEvent {
    return {
      id: `${this.config.connectorId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      connectorId: this.config.connectorId,
      timestamp: Date.now(),
      severity,
      title,
      category: 'webhook',
      eventType,
      status,
      metadata: { raw },
      uiHints: {
        icon: 'webhook',
        color: severity === 'critical' ? '#ef4444'
          : severity === 'error' ? '#f97316'
          : '#6366f1',
      },
    };
  }
}
