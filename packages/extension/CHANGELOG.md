# Changelog

## [0.2.0] — 2026-06-30

### Added
- Model selector in Agent Panel (plan-gated: Free / Pro / Ultra)
- "Xeref: Send Selection to Agent" now prefills the chat input with the selected code block and file path
- `autoApplyEdits` setting: when enabled, `propose_edit` calls apply without manual approval

### Changed
- **Enter** sends the message; **Shift+Enter** inserts a new line (matches xeref.ai web app)

## [0.1.0] — 2026-06-30

### Added
- Xeref activity-bar container with Agent Panel and Agent Manager webviews
- Sessions tree showing your Xeref code sessions
- `Ctrl+L` / `Cmd+L` to open Agent Panel
- `Ctrl+E` / `Cmd+E` to open Agent Manager
- Secure MCP token storage via VS Code SecretStorage
- "Xeref: Connect Account" command to paste your Xeref API token
- "Xeref: Send Selection to Agent" editor context-menu command
- Works in VS Code, Cursor, and Antigravity IDE
