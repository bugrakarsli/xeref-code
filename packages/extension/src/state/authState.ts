import type { AuthManager } from '../auth/AuthManager';
import type { AuthState } from '../shared/messages';
import type { AccountService } from './AccountService';

/** Connection state plus the plan (once the account has loaded) for pushing to a webview. */
export async function currentAuthState(auth: AuthManager, accounts: AccountService): Promise<AuthState> {
  return { connected: await auth.isConnected(), plan: accounts.account?.plan };
}
