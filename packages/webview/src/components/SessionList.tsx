import { useMemo, useState } from 'react';
import type { CodeSession } from '@xeref-code/shared-types';
import { postToHost } from '../lib/vscodeApi';
import { relativeTime } from '../lib/format';
import { Icon } from './Icon';

interface Props {
  sessions: CodeSession[];
  activeId: string | null;
  loading: boolean;
  connected: boolean;
}

/** Sessions with search, open, delete and new. The host confirms deletes in a native dialog. */
export function SessionList({ sessions, activeId, loading, connected }: Props) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => `${s.title} ${s.repoFullName ?? ''}`.toLowerCase().includes(q));
  }, [sessions, query]);

  return (
    <section className="x-section" aria-label="Sessions">
      <div className="x-section-header">
        <span className="x-section-label x-section-label-static">Sessions</span>
        <button
          className="x-btn x-btn-small"
          onClick={() => postToHost({ type: 'session.new' })}
          disabled={!connected}
        >
          <Icon name="plus" /> New session
        </button>
      </div>

      {!connected ? (
        <p className="x-muted x-section-body">Connect your account to see your sessions.</p>
      ) : (
        <>
          {sessions.length > 4 && (
            <label className="x-search">
              <Icon name="search" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sessions"
                aria-label="Search sessions"
              />
            </label>
          )}

          {loading && sessions.length === 0 ? (
            <p className="x-muted x-section-body" aria-live="polite">
              Loading sessions…
            </p>
          ) : visible.length === 0 ? (
            <p className="x-muted x-section-body">{query ? 'No sessions match your search.' : 'No sessions yet.'}</p>
          ) : (
            <ul className="x-session-list">
              {visible.map((s) => (
                <li key={s.id} className={`x-session${s.id === activeId ? ' is-active' : ''}`}>
                  <button
                    className="x-session-open"
                    onClick={() => postToHost({ type: 'session.open', id: s.id })}
                    aria-current={s.id === activeId ? 'true' : undefined}
                  >
                    <span className="x-dot" aria-hidden="true" />
                    <span className="x-session-title">{s.title}</span>
                    <span className="x-session-time">{relativeTime(s.updatedAt)}</span>
                  </button>
                  <button
                    className="x-icon-btn x-session-delete"
                    onClick={() => postToHost({ type: 'session.delete', id: s.id })}
                    aria-label={`Delete session ${s.title}`}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
