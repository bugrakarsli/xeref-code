# Xeref Code

Xeref's IDE-native coding agent — chat, sessions, and approval-gated edits in
your editor.

> Connect your Xeref account, open the Agent Panel, and start chatting with your
> codebase — Xeref proposes diffs you review before anything changes.

---

## Features

- **Agent Panel** — full chat interface inside VS Code. Ask questions, request
  edits, or kick off multi-step tasks without leaving your editor.
- **Agent Manager** — manage multiple Xeref agents and switch context between
  them (`Ctrl+E` / `Cmd+E`).
- **Sessions tree** — browse and resume past code sessions from the Xeref
  activity-bar sidebar.
- **Approval-gated edits** — Xeref proposes file diffs; you accept or reject
  each one. Nothing is applied automatically (unless you opt in via settings).
- **Send selection** — right-click any highlighted code and choose
  "Xeref: Send Selection to Agent" to send it straight to the active session.
- **Secure token storage** — your Xeref API token is stored in VS Code
  SecretStorage (never in plain settings).

---

## Getting Started

1. Install the extension.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run
   **Xeref: Connect Account**.
3. Paste your Xeref API token (get one at [xeref.ai](https://xeref.ai)).
4. Press `Ctrl+L` / `Cmd+L` to open the Agent Panel and start a session.

---

## Keybindings

| Action | Windows / Linux | macOS |
|---|---|---|
| Open Agent Panel | `Ctrl+L` | `Cmd+L` |
| Open Agent Manager | `Ctrl+E` | `Cmd+E` |

> **Note:** `Ctrl+L` and `Ctrl+E` are scoped with `when: "!terminalFocus"` so
> they don't interfere with terminal usage. If they still conflict with your
> setup, rebind them in **File › Preferences › Keyboard Shortcuts**.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `xeref.endpoint` | `https://xeref.ai` | Xeref API base URL |
| `xeref.defaultModel` | `xeref-free` | Default model id (must be allowed by your plan) |
| `xeref.autoApplyEdits` | `false` | Apply agent edits without per-diff approval (not recommended) |
| `xeref.runtime.enabled` | `true` | Enable the local runtime bridge for file edits and commands |

---

## Compatibility

Works in **VS Code**, **Cursor**, and **Antigravity IDE**.

---

## Links

- [xeref.ai](https://xeref.ai)
- [Documentation](https://xeref.ai/docs)
- [Issues](https://github.com/bugrakarsli/xeref-code/issues)

---

Made by Bugra Karsli
