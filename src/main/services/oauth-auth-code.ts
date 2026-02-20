// ============================================================
// OAuth2 Authorization Code Flow
// System browser + localhost callback for Slack and similar
// ============================================================

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import type { OAuthConfig } from '@shared/types';

export interface AuthCodeResult {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  team?: { id: string; name: string };
}

const DEFAULT_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const DEFAULT_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

interface CallbackServer {
  port: number;
  close: () => void;
  waitForCode: () => Promise<string>;
}

/** Start a temporary localhost HTTP server to catch the OAuth redirect */
function startCallbackServer(): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    let codeResolve: (code: string) => void;
    let codeReject: (err: Error) => void;

    const codePromise = new Promise<string>((res, rej) => {
      codeResolve = res;
      codeReject = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (code) {
          res.end('<html><body><h2>Authentication successful!</h2><p>You can close this window and return to iDashboard.</p></body></html>');
          codeResolve(code);
        } else {
          res.end(`<html><body><h2>Authentication failed</h2><p>${error ?? 'Unknown error'}</p></body></html>`);
          codeReject(new Error(error ?? 'No authorization code received'));
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    // Listen on random available port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      resolve({
        port,
        close: () => server.close(),
        waitForCode: () => codePromise,
      });
    });

    server.on('error', reject);

    // Auto-close after 5 minutes to prevent orphaned servers
    setTimeout(() => {
      server.close();
      codeReject(new Error('OAuth callback timed out'));
    }, 5 * 60 * 1000);
  });
}

export async function startAuthCodeFlow(
  config: OAuthConfig,
  openUrl: (url: string) => void,
): Promise<AuthCodeResult> {
  const server = await startCallbackServer();
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `http://127.0.0.1:${server.port}/callback`;

  try {
    const authorizeUrl = config.authorizeUrl ?? DEFAULT_AUTHORIZE_URL;
    const params = new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes.join(','),
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
    });

    // Open system browser
    openUrl(`${authorizeUrl}?${params.toString()}`);

    // Wait for callback
    const code = await server.waitForCode();

    // Exchange code for token
    const tokenUrl = config.tokenUrl ?? DEFAULT_TOKEN_URL;
    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret ?? '',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!resp.ok) {
      throw new Error(`Token exchange failed: ${resp.status}`);
    }

    const data = await resp.json() as Record<string, unknown>;

    if (data.ok === false) {
      throw new Error(`Slack OAuth error: ${data.error}`);
    }

    // Slack returns token differently than standard OAuth
    const accessToken =
      (data.access_token as string) ??
      ((data.authed_user as Record<string, string>)?.access_token);

    if (!accessToken) {
      throw new Error('No access token in response');
    }

    return {
      access_token: accessToken,
      token_type: (data.token_type as string) ?? 'bearer',
      scope: (data.scope as string) ?? '',
      refresh_token: data.refresh_token as string | undefined,
      team: data.team as { id: string; name: string } | undefined,
    };
  } finally {
    server.close();
  }
}
