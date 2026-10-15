import { useCallback, useEffect, useState } from 'react';
import type { AccountInfo } from '@xeref-code/shared-types';
import { onHostMessage, postToHost } from './vscodeApi';

export interface AccountState {
  /** Last good account. Kept while a refresh runs so numbers do not flash away. */
  account?: AccountInfo;
  loading: boolean;
  error?: { message: string; code?: string };
  fetchedAt?: number;
}

/** Account data pushed by the host (AccountService). Each webview owns its own copy of the state. */
export function useAccount(): { state: AccountState; refresh: (force?: boolean) => void } {
  const [state, setState] = useState<AccountState>({ loading: false });

  useEffect(
    () =>
      onHostMessage((message) => {
        switch (message.type) {
          case 'account.loading':
            setState((prev) => ({ ...prev, loading: true, error: undefined }));
            return;
          case 'account.data':
            setState({ account: message.account, fetchedAt: message.fetchedAt, loading: false });
            return;
          case 'account.error':
            setState((prev) => ({ account: prev.account, loading: false, error: { message: message.message, code: message.code } }));
            return;
          case 'auth.state':
            // Signing out drops the cached account so the next user never sees it.
            if (!message.state.connected) setState({ loading: false });
            return;
          default:
            return;
        }
      }),
    []
  );

  const refresh = useCallback((force = true) => postToHost({ type: 'account.get', force }), []);
  return { state, refresh };
}
