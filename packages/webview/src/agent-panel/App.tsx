import { useEffect, useRef, useState } from 'react';
import type { AuthState, ChatMessage, CodeSession, ModelId } from '@xeref-code/shared-types';
import { onHostMessage, postToHost } from '../lib/vscodeApi';
import { pickModel } from '../lib/format';
import { useAccount } from '../lib/useAccount';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Composer } from '../components/Composer';
import { Icon, XerefMark } from '../components/Icon';

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

interface ChatError {
  message: string;
  code?: string;
}

/** Used until the account loads (or on servers without /api/code/account): the free model is always allowed. */
const FALLBACK_MODELS: readonly ModelId[] = ['xeref-free'];

/**
 * Main chat surface (Ctrl+L). Wired to XerefClient via the host (see
 * AgentPanelView) — this component only ever sends/receives postMessage
 * envelopes, never the network or the token directly.
 *
 * `streamingText` accumulates `stream.delta` chunks, which the host derives from parsed
 * text-delta protocol events (see uiMessageStream.ts) — real assistant text, not raw protocol JSON.
 */
export function App() {
  const [auth, setAuth] = useState<AuthState>();
  const [session, setSession] = useState<CodeSession>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<ChatError>();
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<ModelId>('xeref-free');
  const [defaultModel, setDefaultModel] = useState<ModelId>('xeref-free');
  const [autoApply, setAutoApply] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [includeFile, setIncludeFile] = useState(true);
  const [pendingTool, setPendingTool] = useState<PendingToolCall>();
  const [toolOutcome, setToolOutcome] = useState<ToolOutcome>();
  const { state: account } = useAccount();
  const endRef = useRef<HTMLDivElement>(null);
  const userPickedModel = useRef(false);

  const allowedModels = account.account?.models.length ? account.account.models : FALLBACK_MODELS;

  useEffect(() => {
    const off = onHostMessage((message) => {
      switch (message.type) {
        case 'auth.state':
          setAuth(message.state);
          return;
        case 'config.state':
          setAutoApply(message.autoApplyEdits);
          setDefaultModel(message.defaultModel);
          return;
        case 'editor.context':
          setFileName(message.fileName);
          setIncludeFile(true); // a different file starts included again
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
          setError({ message: message.message, code: message.code });
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

  // Until the user picks a model, follow the configured default (once the plan's list is known).
  // After they pick one, keep it unless the plan no longer allows it.
  useEffect(() => {
    setModel((current) =>
      userPickedModel.current && allowedModels.includes(current) ? current : pickModel(allowedModels, defaultModel)
    );
  }, [allowedModels, defaultModel]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streamingText, pendingTool, toolOutcome, error]);

  function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setError(undefined);
    setBusy(true);
    postToHost({ type: 'chat.send', text, model, includeActiveFile: Boolean(fileName) && includeFile });
    setInput('');
  }

  function openSite(path: string) {
    postToHost({ type: 'ui.openExternal', path });
  }

  function renderPart(part: ChatMessage['parts'][number]): string {
    if (part.type === 'text') return part.text;
    if (part.type === 'tool-read_file') return `[read ${part.input.path}]`;
    if (part.type === 'tool-propose_edit') {
      return part.output.applied ? `[edited ${part.input.path}]` : `[edit to ${part.input.path} rejected]`;
    }
    return `[called ${part.toolName}]`;
  }

  const planBlocked = error?.code === 'PLAN_LIMIT';

  return (
    <div className="x-panel">
      <header className="x-brand">
        <span className="x-brand-mark">
          <XerefMark size={18} />
        </span>
        <span className="x-brand-name">Xeref Code</span>
      </header>

      <div className="x-panel-meta">
        <ConnectionStatus state={auth} />
        <button className="x-btn x-btn-small" onClick={() => postToHost({ type: 'session.new' })} disabled={!auth?.connected}>
          <Icon name="plus" /> New session
        </button>
      </div>
      {session && <div className="x-session-name">{session.title}</div>}

      {auth && !auth.connected && (
        <div className="x-card">
          <p className="x-muted">Connect your Xeref account to start.</p>
          <button className="x-btn x-btn-primary" onClick={() => postToHost({ type: 'command.run', id: 'xeref.signIn' })}>
            <Icon name="plug" /> Connect account
          </button>
        </div>
      )}

      <div className="x-transcript" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`x-msg x-msg-${m.role}`}>
            <span className="x-msg-role">{m.role === 'user' ? 'You' : 'Xeref'}</span>
            <div className="x-msg-text">{m.parts.map(renderPart).join(' ')}</div>
          </div>
        ))}
        {streamingText && (
          <div className="x-msg x-msg-assistant">
            <span className="x-msg-role">Xeref</span>
            <div className="x-msg-text">{streamingText}</div>
          </div>
        )}
      </div>

      {pendingTool && (
        <div className="x-card">
          {pendingTool.toolName === 'propose_edit' ? (
            <p>
              <strong>propose_edit</strong> wants to edit <code>{(pendingTool.input as { path?: string }).path}</code> — review the
              diff opened in the editor.
            </p>
          ) : (
            <>
              <p>
                <strong>{pendingTool.toolName}</strong> wants to run with input:
              </p>
              <pre>{JSON.stringify(pendingTool.input, null, 2)}</pre>
            </>
          )}
          <div className="x-actions">
            <button className="x-btn x-btn-primary" onClick={() => postToHost({ type: 'tool.approve', toolCallId: pendingTool.toolCallId })}>
              Approve
            </button>
            <button className="x-btn" onClick={() => postToHost({ type: 'tool.deny', toolCallId: pendingTool.toolCallId })}>
              Deny
            </button>
          </div>
        </div>
      )}

      {toolOutcome && (
        <div className="x-card">
          {toolOutcome.error ? <p className="x-error">{toolOutcome.error}</p> : <pre>{toolOutcome.output}</pre>}
        </div>
      )}

      {error && planBlocked && (
        <div className="x-card x-card-accent" role="alert">
          <p>
            <Icon name="lock" /> {error.message}
          </p>
          {auth?.plan !== 'ultra' && (
            <div className="x-actions">
              <button className="x-btn x-btn-primary" onClick={() => openSite(account.account?.links.upgrade ?? '/pricing')}>
                See plans
              </button>
              <button className="x-btn" onClick={() => postToHost({ type: 'account.get', force: true })}>
                I upgraded, refresh
              </button>
            </div>
          )}
        </div>
      )}
      {error && !planBlocked && (
        <p className="x-error" role="alert">
          {error.message}
        </p>
      )}

      <div ref={endRef} />

      <Composer
        value={input}
        onChange={setInput}
        onSend={handleSend}
        busy={busy}
        models={allowedModels}
        model={model}
        onModelChange={(next) => {
          userPickedModel.current = true;
          setModel(next);
        }}
        plan={auth?.plan}
        autoApply={autoApply}
        onAutoApplyChange={(value) => postToHost({ type: 'config.setAutoApply', value })}
        fileName={fileName}
        includeFile={includeFile}
        onIncludeFileChange={setIncludeFile}
        onUpgrade={() => openSite(account.account?.links.upgrade ?? '/pricing')}
      />
    </div>
  );
}
