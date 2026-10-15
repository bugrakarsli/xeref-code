import type { AccountInfo, ChatMessage, CodeSession, ModelId } from '../shared/messages';
import { parseUIMessageStream, type StreamEvent } from './uiMessageStream';

export interface XerefClientOptions {
  /** e.g. https://xeref.ai — from the `xeref.endpoint` setting. */
  endpoint: string;
  getToken: () => Promise<string | undefined>;
}

/** Error from a non-2xx Xeref API response: `status` is the HTTP code, `code` the body's machine code. */
export class XerefApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'XerefApiError';
  }
}

/** Wire shape of a code_sessions row, as returned by /api/code/sessions. */
interface RawCodeSession {
  id: string;
  title: string;
  repo_full_name: string | null;
  created_at: string;
  updated_at: string;
}

function toCodeSession(raw: RawCodeSession): CodeSession {
  return {
    id: raw.id,
    title: raw.title,
    repoFullName: raw.repo_full_name ?? undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/**
 * Thin transport client for the Xeref backend's /api/code/* routes. Owns the
 * bearer token attach + JSON (de)serialization; callers get camelCase
 * shared-types in/out, never the raw snake_case wire format.
 *
 * Network calls live here and only here — webviews never call fetch
 * directly (see AgentPanelView/AgentManagerView), so the token never leaves
 * the extension host.
 */
export class XerefClient {
  constructor(private readonly options: XerefClientOptions) {}

  private async request(path: string, init: RequestInit = {}, tokenOverride?: string): Promise<Response> {
    const token = tokenOverride ?? (await this.options.getToken());
    if (!token) {
      throw new Error('Xeref Code: not connected. Run "Xeref: Connect Account" first.');
    }

    const res = await fetch(`${this.options.endpoint}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      throw new XerefApiError(body.error ?? `Xeref API error: ${res.status}`, res.status, body.code);
    }

    return res;
  }

  /**
   * Who this token belongs to and what its plan allows. `tokenOverride` lets sign-in verify a
   * pasted token before it is stored. Not plan-gated server-side, so Free/Pro tokens succeed.
   */
  async getAccount(tokenOverride?: string): Promise<AccountInfo> {
    const res = await this.request('/api/code/account', {}, tokenOverride);
    return (await res.json()) as AccountInfo;
  }

  async listSessions(): Promise<CodeSession[]> {
    const res = await this.request('/api/code/sessions');
    const { sessions } = (await res.json()) as { sessions: RawCodeSession[] };
    return sessions.map(toCodeSession);
  }

  async createSession(): Promise<string> {
    const res = await this.request('/api/code/sessions', { method: 'POST' });
    const { id } = (await res.json()) as { id: string };
    return id;
  }

  async deleteSession(id: string): Promise<void> {
    await this.request(`/api/code/sessions/${id}`, { method: 'DELETE' });
  }

  async getSessionMessages(id: string): Promise<ChatMessage[]> {
    const res = await this.request(`/api/code/sessions/${id}/messages`);
    const { messages } = (await res.json()) as { messages: ChatMessage[] };
    return messages;
  }

  /**
   * Posts a chat turn and yields typed StreamEvents parsed from the AI SDK
   * UI-message-stream response (see uiMessageStream.ts). Callers get
   * structured text-delta/message-start/message-done/error events, never
   * raw protocol text.
   */
  async *streamChat(
    sessionId: string,
    messages: ChatMessage[],
    model?: ModelId
  ): AsyncGenerator<StreamEvent> {
    const res = await this.request('/api/code/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId, messages, model }),
    });

    if (!res.body) return;
    yield* parseUIMessageStream(res.body);
  }
}
