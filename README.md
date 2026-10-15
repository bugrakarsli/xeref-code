# Xeref Code

IDE-native coding agent extension for Xeref (xeref.ai). Spec: see the plan
this was scaffolded from for full architecture, roadmap, and rationale.

## Packages

- `packages/extension` — the VS Code/Antigravity extension host
- `packages/webview` — React+Vite UI for the AgentPanel (Ctrl+L) and Agent
  Manager (Ctrl+E) webviews
- `packages/runtime` — local agent runtime (Phase 3 stub; spawned by the
  extension host, never touches the network)
- `packages/shared-types` — single source of truth for host↔webview message
  types

## Develop

```bash
pnpm install
pnpm build          # builds shared-types, webview bundles, and the extension
```

Then open `packages/extension` in VS Code/Antigravity and press F5 to launch
the Extension Development Host (the `xeref-code: build` task runs first).

## Status (v0.3)

- **Agent Panel** (`Ctrl+L`): streaming chat against `/api/code/chat`, plan-gated model
  chip, edit-mode chip (ask before edits / auto-apply), active-file chip, approval-gated
  edits with a native diff.
- **Account & Sessions** (`Ctrl+E`): Account & usage summary with a **View details** popup
  (also opened from the status bar), a Learn checklist, and the session list with search
  and delete.
- Auth is the `mcp_token` pasted from Xeref → Settings → MCP Server Token, stored in
  `SecretStorage` and verified against `GET /api/code/account` before it is saved.
- Needs a Xeref server that serves `/api/code/account`. Against an older server the
  extension still works; the account section shows "does not provide account details yet".
- `/api/code/*` chat and sessions are Ultra-only (`xeref_code`); Free and Pro accounts see
  their plan and an upgrade card instead of an error.

## Known overrides to be aware of

`Ctrl+E` and `Ctrl+L` may collide with host defaults (quick-open / terminal
clear) in some VS Code-family IDEs. They're scoped with `when: "!terminalFocus"`
but can be rebound in Keyboard Shortcuts if they conflict with your setup.
