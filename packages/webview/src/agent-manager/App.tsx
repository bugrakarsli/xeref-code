import { useEffect, useState } from 'react';
import type { AuthState } from '@xeref-code/shared-types';
import { onHostMessage, postToHost } from '../lib/vscodeApi';
import { ConnectionStatus } from '../components/ConnectionStatus';

/**
 * Agent Manager surface (Ctrl+E) — roster/session management only, no chat
 * stream. Structurally isolated from agent-panel/App.tsx; the two share only
 * @xeref-code/shared-types and the ConnectionStatus component. Roster wiring
 * to /api/agents is Phase 4.
 */
export function App() {
  const [auth, setAuth] = useState<AuthState>();

  useEffect(() => {
    const off = onHostMessage((message) => {
      if (message.type === 'auth.state') {
        setAuth(message.state);
      }
    });
    postToHost({ type: 'webview.ready' });
    return off;
  }, []);

  return (
    <div>
      <h3>Xeref Agent Manager</h3>
      <ConnectionStatus state={auth} />
      <p className="xeref-placeholder">Agent roster and session management land in Phase 4.</p>
    </div>
  );
}
