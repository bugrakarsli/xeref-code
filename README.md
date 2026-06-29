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

## Status (Phase 1 — Shell)

- Xeref activity-bar container, AgentPanel + Agent Manager webviews, Sessions
  tree (static), `Ctrl+L`/`Ctrl+E` keybindings, and `mcp_token` auth via
  `SecretStorage` are wired up.
- No backend calls yet — streaming chat (`/api/code/chat`, bearer-guarded)
  lands in Phase 2 on the Xeref Next.js app side first.

## Known overrides to be aware of

`Ctrl+E` and `Ctrl+L` may collide with host defaults (quick-open / terminal
clear) in some VS Code-family IDEs. They're scoped with `when: "!terminalFocus"`
but can be rebound in Keyboard Shortcuts if they conflict with your setup.
