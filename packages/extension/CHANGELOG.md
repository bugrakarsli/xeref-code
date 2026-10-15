# Changelog

## [0.3.0] — 2026-10-16

Requires a Xeref server that serves `GET /api/code/account`. Older servers still work; the
account section reports that details are unavailable.

### Added
- **Account & usage** section with a **View details** popup: email, plan, Xeref Code activity (messages and sessions today and over 7 days), plan limits and your models. Also opens from the status bar and **Xeref: Account & Usage**.
- Token is verified with Xeref when you connect it; a rejected token is not saved.
- The plan is now read from your account, so the model list matches what your plan allows (it was stuck on Xeref Free).
- **Learn Xeref Code** checklist that completes itself as you use the extension, and a one-time **What's new** card.
- **Sessions** list in the Account & Sessions view, with search and delete.
- Message box chips: model picker, edit mode (ask before edits / auto-apply) and active file.
- Upgrade card instead of a raw error when your plan does not include Xeref Code.
- Status bar shows your plan (for example `Xeref · Ultra`).

### Changed
- The Sessions tree and Agent Manager placeholder are now one webview, **Account & Sessions** (`Ctrl+E`).
- `xeref.defaultModel` is now honored when your plan allows that model.

### Fixed
- Connection status showed literal `$(plug)` / `$(check)` text.
- Model ids in the picker (`haiku`, `sonnet`, `opus`) did not match the server's ids; the list now comes from the server.
- Free and Pro accounts no longer get an error toast on every start from the Ultra-only sessions request.

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
