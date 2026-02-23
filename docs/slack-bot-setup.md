# Slack Bot Setup Guide

Complete guide for creating a Slack Bot App with API integration. Useful for any project that needs to read/write Slack messages programmatically.

## 1. Create the Slack App

1. Go to **https://api.slack.com/apps**
2. Click **Create New App**
3. Choose **From scratch**
4. Enter an app name (e.g., "iDashboard Bot") and select your workspace
5. Click **Create App**

## 2. Configure Bot Token Scopes

Scopes define what your bot is allowed to do. You add them in the Slack App dashboard:

1. In left sidebar, click **OAuth & Permissions**
2. Scroll to the **Scopes** section
3. Under **Bot Token Scopes**, click **Add an OAuth Scope** for each scope you need

### iDashboard Required Scopes

These are the scopes the iDashboard Slack connector uses. Add them all under **Bot Token Scopes**.

| Scope | Required? | iDashboard feature | Slack API method |
|-------|-----------|-------------------|-----------------|
| `channels:history` | **Required** | Poll messages from public channels | `conversations.history` |
| `channels:read` | **Required** | Resolve channel names to IDs | `conversations.list` |
| `chat:write` | **Required** | Send messages / replies from Slack panel | `chat.postMessage` |
| `groups:history` | Optional | Poll messages from private channels | `conversations.history` |
| `groups:read` | Optional | Resolve private channel names to IDs | `conversations.list` |
| `im:history` | Optional | Poll DMs sent to the bot (`dmEnabled: true`) | `conversations.history` |
| `im:read` | Optional | Open DM channel with bot itself | `conversations.open` |
| `chat:write.public` | Optional | Send to public channels bot hasn't joined | `chat.postMessage` |
| `reactions:read` | Optional | Future: read emoji reactions | `reactions.get` |
| `reactions:write` | Optional | Future: add reactions to messages | `reactions.add` |
| `users:read` | Optional | Future: resolve user IDs to display names | `users.info` |

> **Important:** `conversations.list` and `conversations.history` only return data for channels the bot has been **invited to**. Even with the right scopes, you must `/invite @BotName` in each channel. The one exception is `chat:write.public`, which lets the bot send to any public channel without being a member — but it still can't *read* from channels it hasn't joined.

### Minimal Scope Sets by Use Case

**Read-only monitoring (public channels):**
```
channels:history, channels:read
```

**Bidirectional messaging — read + write (recommended for iDashboard):**
```
channels:history, channels:read, chat:write
```

**With private channels:**
```
channels:history, channels:read, groups:history, groups:read, chat:write
```

**Full bot with DMs:**
```
channels:history, channels:read, groups:history, groups:read, im:history, im:read, chat:write
```

### Common Scopes Reference

#### Reading Messages
| Scope | What it does |
|-------|-------------|
| `channels:history` | Read messages from **public** channels the bot is in |
| `groups:history` | Read messages from **private** channels the bot is in |
| `im:history` | Read **direct messages** sent to the bot |
| `mpim:history` | Read **group DMs** the bot is in |

#### Reading Channel/User Info
| Scope | What it does |
|-------|-------------|
| `channels:read` | List public channels, get channel info |
| `groups:read` | List private channels the bot is in |
| `users:read` | List users, get user profiles |
| `users:read.email` | Access user email addresses |
| `team:read` | Get workspace info |

#### Writing Messages
| Scope | What it does |
|-------|-------------|
| `chat:write` | Send messages to channels the bot is in |
| `chat:write.public` | Send messages to **any** public channel (no invite needed) |
| `chat:write.customize` | Send messages with custom username/icon |

#### Reactions & Threads
| Scope | What it does |
|-------|-------------|
| `reactions:read` | Read emoji reactions on messages |
| `reactions:write` | Add/remove emoji reactions |

#### Files
| Scope | What it does |
|-------|-------------|
| `files:read` | Read files shared in channels |
| `files:write` | Upload files to channels |

#### Other Useful Scopes
| Scope | What it does |
|-------|-------------|
| `pins:read` | Read pinned messages |
| `pins:write` | Pin/unpin messages |
| `bookmarks:read` | Read channel bookmarks |
| `bookmarks:write` | Add/remove channel bookmarks |
| `commands` | Register and handle slash commands |

## 3. Install the App to Your Workspace

1. After adding scopes, scroll up on the **OAuth & Permissions** page
2. Click **Install to Workspace**
3. Review the permissions and click **Allow**
4. Copy the **Bot User OAuth Token** — it starts with `xoxb-`

> **Important:** If you change scopes later, you must **Reinstall** the app for changes to take effect.

## 4. Invite the Bot to Channels

The bot can only access channels it has been invited to (unless you use `chat:write.public`).

In each Slack channel you want the bot to access:
```
/invite @YourBotName
```

Or via the API:
```bash
curl -X POST https://slack.com/api/conversations.invite \
  -H "Authorization: Bearer xoxb-YOUR-TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "C1234567890", "users": "U_BOT_USER_ID"}'
```

## 5. Token Types Reference

| Token prefix | Type | Use case |
|-------------|------|----------|
| `xoxb-` | Bot token | Server-side integrations, recommended for most use cases |
| `xoxp-` | User token | Acts as a specific user, needed for some admin APIs |
| `xoxe-` | Enterprise token | Org-wide admin actions on Enterprise Grid |
| `xapp-` | App-level token | Socket Mode connections, no workspace context |

**For most integrations, use the Bot token (`xoxb-`).**

## 6. Key API Endpoints

### Send a message
```bash
curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer xoxb-YOUR-TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "C1234567890", "text": "Hello from the bot!"}'
```

### Reply in a thread
```bash
curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer xoxb-YOUR-TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel": "C1234567890", "text": "Thread reply", "thread_ts": "1234567890.123456"}'
```

### Read channel history
```bash
curl "https://slack.com/api/conversations.history?channel=C1234567890&limit=10" \
  -H "Authorization: Bearer xoxb-YOUR-TOKEN"
```

### List channels
```bash
curl "https://slack.com/api/conversations.list?types=public_channel&limit=100" \
  -H "Authorization: Bearer xoxb-YOUR-TOKEN"
```

### Get user info
```bash
curl "https://slack.com/api/users.info?user=U1234567890" \
  -H "Authorization: Bearer xoxb-YOUR-TOKEN"
```

## 7. Rate Limits

Slack enforces rate limits per method and workspace:

| Tier | Requests/min | Common methods |
|------|-------------|----------------|
| Tier 1 | 1 | `chat.delete`, `conversations.kick` |
| Tier 2 | 20 | `conversations.list`, `users.list` |
| Tier 3 | 50 | `conversations.history`, `reactions.add` |
| Tier 4 | 100 | `chat.postMessage` |

When rate-limited, the API returns HTTP 429 with a `Retry-After` header (seconds).

## 8. Corporate / Enterprise Grid Considerations

### App Approval
- Enterprise Grid workspaces often require admin approval for custom apps
- Ask your Slack admin or check **Administration > Apps** for a self-serve approval flow
- Some orgs have an "app request" workflow — submit your app for review

### Network Requirements
- All Slack API calls go to `https://api.slack.com` over HTTPS (port 443)
- No inbound connections needed for polling-based integrations
- If behind a corporate proxy, ensure `HTTPS_PROXY` is set or your HTTP client respects system proxy settings

### Data Loss Prevention (DLP)
- Some orgs restrict what bots can read/write via Slack's DLP policies
- Bot messages may be subject to compliance/archival rules
- Avoid sending sensitive data (credentials, PII) through bot messages

### Token Security
- **Never commit tokens to git** — use environment variables or encrypted config
- Rotate tokens periodically via the app dashboard
- Use the principle of least privilege — only request scopes you actually need
- Bot tokens can be revoked instantly from the app dashboard if compromised

## 9. Webhook Alternative (Event-based)

Instead of polling, Slack can push events to your server:

1. In your app dashboard, go to **Event Subscriptions**
2. Enable events and set a **Request URL** (must be HTTPS, publicly accessible)
3. Subscribe to events like `message.channels`, `app_mention`
4. Slack sends POST requests to your URL when events occur

This is more efficient than polling but requires an inbound HTTPS endpoint, which is harder in local/corporate setups. For desktop apps, **polling is simpler and works behind firewalls**.

## 10. Socket Mode (No Public URL Needed)

For apps that can't expose a public URL:

1. In app dashboard, go to **Socket Mode** and enable it
2. Generate an **App-Level Token** (`xapp-`) with `connections:write` scope
3. Connect via WebSocket to receive events in real-time

This gives you real-time events without needing a public endpoint. Requires the `@slack/socket-mode` npm package or equivalent WebSocket client.
