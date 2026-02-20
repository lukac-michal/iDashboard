// ============================================================
// OAuth2 Device Flow (RFC 8628)
// Used for GitHub authentication in desktop apps
// ============================================================

import type { OAuthConfig } from '@shared/types';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface DeviceFlowResult {
  access_token: string;
  token_type: string;
  scope: string;
}

export type DeviceFlowStatus =
  | { state: 'pending'; userCode: string; verificationUri: string }
  | { state: 'polling' }
  | { state: 'success'; token: string }
  | { state: 'error'; message: string };

const DEFAULT_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const DEFAULT_TOKEN_URL = 'https://github.com/login/oauth/access_token';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function requestDeviceCode(config: OAuthConfig): Promise<DeviceCodeResponse> {
  const url = config.deviceCodeUrl ?? DEFAULT_DEVICE_CODE_URL;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: config.clientId,
      scope: config.scopes.join(' '),
    }),
  });

  if (!resp.ok) {
    throw new Error(`Device code request failed: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

export async function pollForToken(
  config: OAuthConfig,
  deviceCode: string,
  interval: number,
  expiresIn: number,
  signal?: AbortSignal,
): Promise<DeviceFlowResult> {
  const deadline = Date.now() + expiresIn * 1000;
  let pollInterval = interval * 1000;
  const tokenUrl = config.tokenUrl ?? DEFAULT_TOKEN_URL;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Device flow cancelled');

    await sleep(pollInterval);

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal,
    });

    const data = await resp.json() as Record<string, string>;

    if (data.access_token) {
      return {
        access_token: data.access_token,
        token_type: data.token_type ?? 'bearer',
        scope: data.scope ?? '',
      };
    }

    if (data.error === 'slow_down') {
      pollInterval += 5000;
    } else if (data.error === 'expired_token') {
      throw new Error('Device code expired — please try again');
    } else if (data.error && data.error !== 'authorization_pending') {
      throw new Error(`OAuth error: ${data.error} — ${data.error_description ?? ''}`);
    }
    // authorization_pending → continue polling
  }

  throw new Error('Device flow timed out');
}
