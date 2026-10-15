import * as vscode from 'vscode';
import type { AccountInfo } from '../shared/messages';
import { XerefApiError, type XerefClient } from '../api/XerefClient';

/** Account data is cheap to refetch but changes rarely; reuse it for this long unless forced. */
const TTL_MS = 60_000;

export type AccountSnapshot =
  | { status: 'idle' }
  | { status: 'loading'; previous?: { account: AccountInfo; fetchedAt: number } }
  | { status: 'ready'; account: AccountInfo; fetchedAt: number }
  | { status: 'error'; message: string; code?: string };

/**
 * Single owner of "who am I and what does my plan allow" (GET /api/code/account). Both webviews
 * and the status bar read from here, so a refresh in one place updates every surface.
 */
export class AccountService {
  private readonly _onDidChange = new vscode.EventEmitter<AccountSnapshot>();
  readonly onDidChange = this._onDidChange.event;

  private snapshot: AccountSnapshot = { status: 'idle' };
  private inflight?: Promise<void>;

  constructor(
    private readonly client: XerefClient,
    private readonly isConnected: () => Promise<boolean>
  ) {}

  get current(): AccountSnapshot {
    return this.snapshot;
  }

  /** The last successfully fetched account, even while a refresh is in flight. */
  get account(): AccountInfo | undefined {
    if (this.snapshot.status === 'ready') return this.snapshot.account;
    if (this.snapshot.status === 'loading') return this.snapshot.previous?.account;
    return undefined;
  }

  async refresh(force = false): Promise<void> {
    if (!(await this.isConnected())) {
      this.clear();
      return;
    }
    if (this.inflight) return this.inflight;
    if (!force && this.snapshot.status === 'ready' && Date.now() - this.snapshot.fetchedAt < TTL_MS) return;

    const previous =
      this.snapshot.status === 'ready'
        ? { account: this.snapshot.account, fetchedAt: this.snapshot.fetchedAt }
        : undefined;
    this.set({ status: 'loading', previous });

    this.inflight = this.client
      .getAccount()
      .then((account) => this.set({ status: 'ready', account, fetchedAt: Date.now() }))
      .catch((err: unknown) => this.set(toErrorSnapshot(err)))
      .finally(() => {
        this.inflight = undefined;
      });
    return this.inflight;
  }

  clear(): void {
    this.set({ status: 'idle' });
  }

  private set(snapshot: AccountSnapshot): void {
    this.snapshot = snapshot;
    this._onDidChange.fire(snapshot);
  }
}

function toErrorSnapshot(err: unknown): AccountSnapshot {
  if (err instanceof XerefApiError) {
    // A Xeref server that predates /api/code/account answers 404: say so instead of "API error".
    if (err.status === 404) {
      return { status: 'error', code: 'UNAVAILABLE', message: 'This Xeref server does not provide account details yet.' };
    }
    if (err.status === 401) {
      return { status: 'error', code: 'UNAUTHORIZED', message: 'Xeref rejected your token. Reconnect your account.' };
    }
    return { status: 'error', code: err.code, message: err.message };
  }
  return { status: 'error', message: err instanceof Error ? err.message : 'Could not reach Xeref.' };
}
