/**
 * Shared types between the Xeref Code extension host and its webviews —
 * and, for the chat/session shapes, the wire contract with the Xeref
 * backend's /api/code/* routes.
 *
 * Deliberately duplicated (not imported) from the Xeref Next.js app's
 * lib/types.ts — the extension is a separate build and must not depend on
 * the Next app's build graph. Keep this file small; only add what the
 * extension/webview boundary actually needs.
 */

export type Role = 'user' | 'assistant' | 'system';

/** Backend emits text and tool-call parts (see code_messages.parts in the
 * Xeref repo). `tool-read_file` / `tool-propose_edit` are the wire-exact
 * shapes the ai SDK's convertToModelMessages expects for a resolved tool
 * part — type name `tool-${toolName}`, a `state` discriminant, and `output`
 * matching the tool's outputSchema. Only these two are modeled today; widen
 * per-tool when other tools get round-trip support. */
export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | {
      type: 'tool-read_file';
      toolCallId: string;
      state: 'output-available';
      input: { path: string };
      output: { content: string };
    }
  | {
      type: 'tool-propose_edit';
      toolCallId: string;
      state: 'output-available';
      input: { path: string; content: string };
      output: { applied: boolean };
    };

/** Matches the wire shape of both POST /api/code/chat (input) and
 * GET /api/code/sessions/:id/messages (output) in the Xeref repo. */
export interface ChatMessage {
  id: string;
  role: Role;
  parts: MessagePart[];
}

export interface CodeSession {
  id: string;
  title: string;
  repoFullName?: string;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors the client-facing model ids in lib/ai/openrouter-config.ts (PLAN_MODELS). */
export type ModelId = string;

export interface DiffProposal {
  path: string;
  original: string;
  modified: string;
  summary: { added: number; removed: number };
}

export type Plan = 'free' | 'pro' | 'ultra';

export interface AuthState {
  connected: boolean;
  plan?: Plan;
}

/** Wire shape of GET /api/code/account in the Xeref repo. `null` limit = unlimited. */
export interface AccountInfo {
  email: string | null;
  plan: Plan;
  /** Model ids this plan may use in Xeref Code (chat-only models already removed). */
  models: ModelId[];
  features: { xeref_code: boolean };
  limits: { deploy_channels: number | null; scheduled_jobs: number | null; dots: number | null };
  usage: {
    today: { messages: number; sessions: number };
    week: { messages: number; sessions: number };
  };
  /** Paths relative to the configured endpoint. */
  links: { manage: string; upgrade: string };
}

/** Onboarding checklist steps, in display order. */
export type MilestoneId = 'connect' | 'firstChat' | 'sendSelection' | 'reviewEdit' | 'tryModel';

export interface OnboardingState {
  done: MilestoneId[];
  /** Learn card dismissed (or finished). */
  learnDismissed: boolean;
  /** Extension version whose What's New card was dismissed. */
  whatsNewSeen: string | null;
  version: string;
}

/** Messages sent from the extension host to a webview. */
export type HostToWebview =
  | { type: 'session.loaded'; session: CodeSession; messages: ChatMessage[] }
  | { type: 'stream.delta'; text: string }
  | { type: 'stream.done' }
  | { type: 'chat.error'; message: string; code?: string }
  | { type: 'diff.proposed'; proposal: DiffProposal }
  | { type: 'auth.state'; state: AuthState }
  | { type: 'tool.requested'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool.result'; toolCallId: string; output: unknown }
  | { type: 'tool.error'; toolCallId: string; message: string }
  | { type: 'input.prefill'; text: string }
  | { type: 'account.loading' }
  | { type: 'account.data'; account: AccountInfo; fetchedAt: number }
  | { type: 'account.error'; message: string; code?: string }
  | { type: 'account.open' }
  | { type: 'onboarding.state'; state: OnboardingState }
  | { type: 'editor.context'; fileName: string | null }
  | { type: 'config.state'; autoApplyEdits: boolean; defaultModel: ModelId }
  | { type: 'sessions.list'; sessions: CodeSession[]; activeId: string | null; loading: boolean };

/** Messages sent from a webview to the extension host. */
export type WebviewToHost =
  | { type: 'chat.send'; text: string; model?: ModelId; includeActiveFile?: boolean }
  | { type: 'session.new' }
  | { type: 'diff.accept'; path: string }
  | { type: 'diff.reject'; path: string }
  | { type: 'command.run'; id: string }
  | { type: 'webview.ready' }
  | { type: 'tool.approve'; toolCallId: string }
  | { type: 'tool.deny'; toolCallId: string }
  | { type: 'account.get'; force?: boolean }
  /** `path` is joined to the configured endpoint by the host; absolute URLs are rejected. */
  | { type: 'ui.openExternal'; path: string }
  | { type: 'onboarding.step'; id: MilestoneId }
  | { type: 'onboarding.dismiss'; what: 'learn' | 'whatsNew' }
  | { type: 'config.setAutoApply'; value: boolean }
  | { type: 'session.open'; id: string }
  | { type: 'session.delete'; id: string }
  | { type: 'sessions.refresh' };
