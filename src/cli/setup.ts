// ============================================================
// CLI Setup Tool - Configure Claude Code hooks and initial config
// Usage: npx ts-node src/cli/setup.ts claude-code
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const DASHBOARD_PORT = 19280;
const CONFIG_DIR = path.join(os.homedir(), '.idashboard');
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

function setupClaudeCode(): void {
  console.log('Setting up Claude Code hooks for iDashboard...\n');

  // Ensure iDashboard config directory exists
  fs.mkdirSync(path.join(CONFIG_DIR, 'connectors'), { recursive: true });

  // Create Claude Code connector config if not exists
  const connectorPath = path.join(CONFIG_DIR, 'connectors', 'claude-code.yaml');
  if (!fs.existsSync(connectorPath)) {
    fs.writeFileSync(connectorPath, `id: claude-code
type: claude-code
displayName: "Claude Code"
enabled: true
pollIntervalMs: 0
auth:
  type: none
settings:
  blinkDurationMs: 30000
  autoExpireCompletedMs: 300000
ui:
  icon: terminal
  color: "#f97316"
  priority: 1
  showBadge: true
  blinkOnAttention: true
`);
    console.log(`  Created connector config: ${connectorPath}`);
  }

  // Create or update Claude Code hooks
  const hooks = {
    hooks: {
      Notification: [
        {
          type: 'command',
          command: `curl -s -X POST http://localhost:${DASHBOARD_PORT}/api/v1/events -H 'Content-Type: application/json' -d '{"connector":"claude-code","event":"needs-input","session":"'"$CLAUDE_SESSION_ID"'","message":"'"$(echo $HOOK_PAYLOAD | jq -r .message 2>/dev/null || echo notification)"'"}'`,
        },
      ],
      Stop: [
        {
          type: 'command',
          command: `curl -s -X POST http://localhost:${DASHBOARD_PORT}/api/v1/events -H 'Content-Type: application/json' -d '{"connector":"claude-code","event":"task-complete","session":"'"$CLAUDE_SESSION_ID"'"}'`,
        },
      ],
    },
  };

  if (fs.existsSync(CLAUDE_SETTINGS)) {
    try {
      const existing = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf-8'));
      existing.hooks = {
        ...existing.hooks,
        ...hooks.hooks,
      };
      fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(existing, null, 2));
      console.log(`  Updated Claude Code hooks in: ${CLAUDE_SETTINGS}`);
    } catch (err) {
      console.error(`  Failed to update ${CLAUDE_SETTINGS}:`, err);
      console.log('\n  You can manually add these hooks to your settings:');
      console.log(JSON.stringify(hooks, null, 2));
    }
  } else {
    console.log(`\n  Claude Code settings not found at: ${CLAUDE_SETTINGS}`);
    console.log('  Add these hooks to your ~/.claude/settings.json:\n');
    console.log(JSON.stringify(hooks, null, 2));
  }

  console.log('\n  Setup complete! Start iDashboard and Claude Code will send notifications.');
}

function setupGenericConfig(): void {
  fs.mkdirSync(path.join(CONFIG_DIR, 'connectors'), { recursive: true });
  fs.mkdirSync(path.join(CONFIG_DIR, 'layouts'), { recursive: true });
  fs.mkdirSync(path.join(CONFIG_DIR, 'themes'), { recursive: true });

  const configPath = path.join(CONFIG_DIR, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `# iDashboard Configuration
# All values shown are defaults — only override what you need

window:
  defaultMode: floating
  size:
    width: 400
    height: 300
  theme: dark
  dock:
    position: bottom-right
    autoHide: false
  alwaysOnTop:
    permanent: false
    onNotification:
      enabled: true
      durationSec: 30
      afterExpiry: hide

api:
  port: ${DASHBOARD_PORT}
  bind: "127.0.0.1"

startup:
  startMinimized: true
`);
    console.log(`Created config: ${configPath}`);
  }
}

// Main
const command = process.argv[2];

switch (command) {
  case 'claude-code':
    setupClaudeCode();
    break;
  case 'init':
    setupGenericConfig();
    console.log(`\nConfig directory created at ${CONFIG_DIR}`);
    console.log('Add connector YAML files to ~/.idashboard/connectors/');
    break;
  default:
    console.log('iDashboard Setup');
    console.log('');
    console.log('Usage:');
    console.log('  setup init            Create default configuration');
    console.log('  setup claude-code     Configure Claude Code hooks');
    break;
}
