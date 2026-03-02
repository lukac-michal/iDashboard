#!/usr/bin/env python3
"""
Claude Code → iDashboard Bridge Hook

Reads Claude Code hook JSON from stdin and forwards events
to the iDashboard API for routing to Slack and the dashboard.

Supported hook types: notification, stop, subagent-stop, tool-use,
                      user-prompt, task-complete

Install by adding to ~/.claude/settings.json:
{
  "hooks": {
    "Notification": [{"hooks": [{"type": "command", "command": "python3 ~/.idashboard/hooks/claude-bridge.py notification", "async": true}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "python3 ~/.idashboard/hooks/claude-bridge.py stop"}]}],
    "SubagentStop": [{"hooks": [{"type": "command", "command": "python3 ~/.idashboard/hooks/claude-bridge.py subagent-stop"}]}],
    "PostToolUse": [{"hooks": [{"type": "command", "command": "python3 ~/.idashboard/hooks/claude-bridge.py tool-use"}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "python3 ~/.idashboard/hooks/claude-bridge.py user-prompt"}]}]
  }
}
"""

import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

API_URL = os.environ.get("IDASHBOARD_API", "http://localhost:19280/api/v1/events")
MAX_LENGTH = 3000


def detect_connector() -> str:
    """Auto-detect whether we're running inside Cursor or a plain terminal.

    Cursor (VS Code fork) sets TERM_PROGRAM and/or VSCODE_* env vars.
    Override with IDASHBOARD_CONNECTOR env var if needed.
    """
    override = os.environ.get("IDASHBOARD_CONNECTOR", "")
    if override:
        return override
    term = os.environ.get("TERM_PROGRAM", "").lower()
    if term in ("vscode", "cursor"):
        return "cursor"
    if os.environ.get("VSCODE_PID"):
        return "cursor"
    return "claude-code"


def connector_label() -> str:
    """Human-readable label for the current connector."""
    return "Cursor" if detect_connector() == "cursor" else "Claude Code"


def truncate(text: str, limit: int = MAX_LENGTH) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 20] + "\n\n... (truncated)"


def get_iterm_tab_name():
    """Resolve the actual iTerm2 tab/session name via AppleScript.

    Reads ITERM_SESSION_ID (format "w0t0p0:GUID"), extracts the GUID,
    then asks iTerm2 for the session name that matches.
    Returns None on any failure (not macOS, no iTerm2, timeout, etc.).
    """
    if sys.platform != "darwin":
        return None

    iterm_id = os.environ.get("ITERM_SESSION_ID", "")
    if not iterm_id or ":" not in iterm_id:
        return None

    guid = iterm_id.split(":", 1)[1]
    if not guid:
        return None

    script = f'''
tell application "iTerm2"
    set targetId to "{guid}"
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                try
                    if (unique id of s) contains targetId then
                        return name of s
                    end if
                end try
            end repeat
        end repeat
    end repeat
end tell
return ""
'''

    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=2,
        )
        name = result.stdout.strip()
        return name if name else None
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None


def get_session_name() -> str:
    """Derive a human-readable session name from the working directory.

    Uses directory basename — stable across process changes (caffeinate, node, etc.).
    Tab focusing uses itermSessionId (GUID) instead, so this is purely cosmetic.
    """
    cwd = os.environ.get("PWD", os.getcwd())
    return os.path.basename(cwd)


def get_base_metadata() -> dict:
    """Collect terminal identity metadata for precise tab focusing."""
    meta = {}
    # iTerm2 unique session ID — allows exact tab matching via AppleScript
    iterm_id = os.environ.get("ITERM_SESSION_ID", "")
    if iterm_id:
        meta["itermSessionId"] = iterm_id
    # TERM_SESSION_ID as fallback
    term_id = os.environ.get("TERM_SESSION_ID", "")
    if term_id:
        meta["termSessionId"] = term_id
    return meta


def post_event(
    event_type: str, title: str, body: str, session: str, metadata=None
) -> None:
    # Merge base terminal metadata with event-specific metadata
    merged = get_base_metadata()
    if metadata:
        merged.update(metadata)

    payload = {
        "connector": detect_connector(),
        "event": event_type,
        "title": title,
        "body": truncate(body),
        "severity": "info",
        "session": session,
        "metadata": merged,
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=5):
            pass
    except (urllib.error.URLError, OSError):
        # Silently fail — don't block Claude Code
        pass


def handle_notification(hook_data: dict) -> None:
    """Handle Notification hook — Claude needs user input."""
    session = get_session_name()
    message = hook_data.get("message", "")
    post_event(
        event_type="needs-input",
        title=f"{connector_label()}: {session}",
        body=message or "Waiting for your input",
        session=session,
        metadata={"hookType": "notification"},
    )


def handle_task_complete(hook_data: dict) -> None:
    """Handle task-complete — Claude finished its task."""
    session = get_session_name()
    post_event(
        event_type="task-complete",
        title=f"{connector_label()}: {session}",
        body="Task completed",
        session=session,
        metadata={"hookType": "task-complete"},
    )


def handle_stop(hook_data: dict) -> None:
    """Handle Stop / SubagentStop hooks — contains last_assistant_message."""
    message = hook_data.get("last_assistant_message", "")
    if not message:
        return

    session = get_session_name()
    event_type = "output-stop"
    if len(sys.argv) > 1 and sys.argv[1] == "subagent-stop":
        event_type = "output-subagent-stop"

    post_event(
        event_type=event_type,
        title=f"{connector_label()}: {session}",
        body=message,
        session=session,
        metadata={"hookType": sys.argv[1] if len(sys.argv) > 1 else "stop"},
    )


def handle_tool_use(hook_data: dict) -> None:
    """Handle PostToolUse hooks — contains tool_name, tool_input, tool_response."""
    tool_name = hook_data.get("tool_name", "unknown")
    tool_input = hook_data.get("tool_input", {})
    tool_response = hook_data.get("tool_response", "")

    # Only forward interesting tools, skip noisy internal ones
    skip_tools = {"Read", "Glob", "Grep", "WebSearch", "WebFetch"}
    if tool_name in skip_tools:
        return

    session = get_session_name()

    # Build a readable summary
    if isinstance(tool_input, dict):
        input_summary = json.dumps(tool_input, indent=2, ensure_ascii=False)
    else:
        input_summary = str(tool_input)

    if isinstance(tool_response, dict):
        response_text = json.dumps(tool_response, indent=2, ensure_ascii=False)
    else:
        response_text = str(tool_response)

    body = f"**Tool:** `{tool_name}`\n"
    if input_summary and input_summary != "{}":
        body += f"**Tool Input:**\n```\n{truncate(input_summary, 1000)}\n```\n"
    if response_text:
        body += f"**Result:**\n```\n{truncate(response_text, 1500)}\n```"

    post_event(
        event_type="output-tool-use",
        title=f"{connector_label()}: {session} [{tool_name}]",
        body=body,
        session=session,
        metadata={"hookType": "tool-use", "toolName": tool_name},
    )


def handle_user_prompt(hook_data: dict) -> None:
    """Handle UserPromptSubmit hooks — contains the user's typed prompt."""
    prompt = hook_data.get("prompt", "")
    if not prompt:
        return

    session = get_session_name()

    post_event(
        event_type="user-prompt",
        title=f"{connector_label()}: {session}",
        body=prompt,
        session=session,
        metadata={"hookType": "user-prompt"},
    )


def main() -> None:
    # Read hook payload from stdin
    hook_data = {}
    try:
        raw = sys.stdin.read()
        if raw.strip():
            hook_data = json.loads(raw)
    except (json.JSONDecodeError, IOError):
        pass

    # Determine hook type from command-line argument
    hook_type = sys.argv[1] if len(sys.argv) > 1 else "stop"

    if hook_type == "notification":
        handle_notification(hook_data)
    elif hook_type == "task-complete":
        handle_task_complete(hook_data)
    elif hook_type in ("stop", "subagent-stop"):
        handle_stop(hook_data)
    elif hook_type == "tool-use":
        handle_tool_use(hook_data)
    elif hook_type == "user-prompt":
        handle_user_prompt(hook_data)


if __name__ == "__main__":
    main()
