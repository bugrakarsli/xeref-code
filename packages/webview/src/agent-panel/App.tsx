import { useEffect, useState } from 'react';
import type { AuthState, ChatMessage, CodeSession, ModelId } from '@xeref-code/shared-types';
import { onHostMessage, postToHost } from '../lib/vscodeApi';
import { ConnectionStatus } from '../components/ConnectionStatus';

const MODELS: { id: ModelId; label: string; minPlan: 'free' | 'pro' | 'ultra' }[] = [
  { id: 'xeref-free', label: 'Xeref Free', minPlan: 'free' },
  { id: 'haiku',      label: 'Claude Haiku',   minPlan: 'pro' },
  { id: 'sonnet',     label: 'Claude Sonnet',   minPlan: 'pro' },
  { id: 'opus',       label: 'Claude Opus',     minPlan: 'ultra' },
  { id: 'best',       label: 'Best (auto)',      minPlan: 'ultra' },
];

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, ultra: 2 };

interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

interface ToolOutcome {
  toolCallId: string;
  output?: string;
  error?: string;
}

/**
 * Main chat surface (Ctrl+L). Wired to XerefClient via the host (see
 * AgentPanelView) — this component only ever sends/receives postMessage
 * envelopes, never the network or the token directly.
 *
 * `streamingText` accumulates `stream.delta` chunks, which the host now
 * derives from parsed text-delta protocol events (see uiMessageStream.ts) —
 * this is real assistant text, not raw protocol JSON.
 */
export function App() {
  const [auth, setAuth] = useState<AuthState>();
  const [session, setSession] = useState<CodeSession>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<ModelId>('xeref-free');
  const [pendingTool, setPendingTool] = useState<PendingToolCall>();
  const [toolOutcome, setToolOutcome] = useState<ToolOutcome>();

  useEffect(() => {
    const off = onHostMessage((message) => {
      switch (message.type) {
        case 'auth.state':
          setAuth(message.state);
          return;
        case 'session.loaded':
          setSession(message.session);
          setMessages(message.messages);
          setStreamingText('');
          setError(undefined);
          setPendingTool(undefined);
          setToolOutcome(undefined);
          return;
        case 'stream.delta':
          setBusy(true);
          setStreamingText((prev) => prev + message.text);
          return;
        case 'stream.done':
          setBusy(false);
          setStreamingText('');
          return;
        case 'chat.error':
          setBusy(false);
          setError(message.message);
          return;
        case 'tool.requested':
          setToolOutcome(undefined);
          setPendingTool({ toolCallId: message.toolCallId, toolName: message.toolName, input: message.input });
          return;
        case 'tool.result':
          setPendingTool(undefined);
          setToolOutcome({
            toolCallId: message.toolCallId,
            output: typeof message.output === 'string' ? message.output : JSON.stringify(message.output),
          });
          return;
        case 'tool.error':
          setPendingTool(undefined);
          setToolOutcome({ toolCallId: message.toolCallId, error: message.message });
          return;
        case 'input.prefill':
          setInput((prev) => message.text + prev);
          return;
        default:
          return;
      }
    });
    postToHost({ type: 'webview.ready' });
    return off;
  }, []);

  function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setError(undefined);
    setBusy(true);
    postToHost({ type: 'chat.send', text, model });
    setInput('');
  }

  function renderPart(part: ChatMessage['parts'][number]): string {
    if (part.type === 'text') return part.text;
    if (part.type === 'tool-read_file') return `[read ${part.input.path}]`;
    if (part.type === 'tool-propose_edit') {
      return part.output.applied ? `[edited ${part.input.path}]` : `[edit to ${part.input.path} rejected]`;
    }
    return `[called ${part.toolName}]`;
  }

  return (
    <div>
      <h3>Xeref Agent Panel</h3>
      <ConnectionStatus state={auth} />

      <div className="xeref-session-row">
        <span>{session ? session.title : 'No session open'}</span>
        <button className="xeref-connect" onClick={() => postToHost({ type: 'session.new' })}>
          New session
        </button>
      </div>

      <div className="xeref-transcript">
        {messages.map((m) => (
          <p key={m.id}>
            <strong>{m.role}:</strong> {m.parts.map(renderPart).join(' ')}
          </p>
        ))}
        {streamingText && (
          <p>
            <strong>assistant:</strong> {streamingText}
          </p>
        )}
      </div>

      {pendingTool && (
        <div className="xeref-tool-card">
          {pendingTool.toolName === 'propose_edit' ? (
            <p>
              <strong>propose_edit</strong> wants to edit{' '}
              <code>{(pendingTool.input as { path?: string }).path}</code> — review the diff opened in the editor.
            </p>
          ) : (
            <>
              <p>
                <strong>{pendingTool.toolName}</strong> wants to run with input:
              </p>
              <pre>{JSON.stringify(pendingTool.input, null, 2)}</pre>
            </>
          )}
          <div className="xeref-tool-actions">
            <button
              className="xeref-connect"
              onClick={() => postToHost({ type: 'tool.approve', toolCallId: pendingTool.toolCallId })}
            >
              Approve
            </button>
            <button
              className="xeref-connect xeref-deny"
              onClick={() => postToHost({ type: 'tool.deny', toolCallId: pendingTool.toolCallId })}
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {toolOutcome && (
        <div className="xeref-tool-card">
          {toolOutcome.error ? (
            <p className="xeref-error">{toolOutcome.error}</p>
          ) : (
            <pre>{toolOutcome.output}</pre>
          )}
        </div>
      )}

      {error && <p className="xeref-error">{error}</p>}

      <select
        value={model}
        onChange={(e) => setModel(e.target.value as ModelId)}
        disabled={busy}
      >
        {MODELS.filter((m) => PLAN_RANK[m.minPlan] <= PLAN_RANK[auth?.plan ?? 'free']).map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        placeholder="Message Xeref… (Shift+Enter for new line)"
        rows={3}
        disabled={busy}
      />
      <button className="xeref-connect" onClick={handleSend} disabled={busy}>
        {busy ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
}
