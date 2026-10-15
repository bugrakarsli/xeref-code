import * as vscode from 'vscode';
import type { CodeSession } from '../shared/messages';
import type { XerefClient } from '../api/XerefClient';

export interface SessionsSnapshot {
  sessions: CodeSession[];
  activeId: string | null;
  loading: boolean;
}

/**
 * Session history for the Account & Sessions view. Replaces the old native tree provider:
 * `load()` fetches GET /api/code/sessions, `remove()` calls DELETE, and the active id follows
 * whichever session the chat panel has open.
 */
export class SessionStore {
  private readonly _onDidChange = new vscode.EventEmitter<SessionsSnapshot>();
  readonly onDidChange = this._onDidChange.event;

  private sessions: CodeSession[] = [];
  private activeId: string | null = null;
  private loading = false;

  constructor(private readonly client: XerefClient) {}

  get snapshot(): SessionsSnapshot {
    return { sessions: this.sessions, activeId: this.activeId, loading: this.loading };
  }

  find(id: string): CodeSession | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  async load(): Promise<void> {
    this.loading = true;
    this.emit();
    try {
      this.sessions = await this.client.listSessions();
    } catch (err) {
      this.sessions = [];
      const message = err instanceof Error ? err.message : 'Failed to load sessions';
      void vscode.window.showErrorMessage(`Xeref Code: ${message}`);
    } finally {
      this.loading = false;
      this.emit();
    }
  }

  /** Re-renders from memory without a request (used to clear the list on sign-out). */
  reset(sessions: CodeSession[] = []): void {
    this.sessions = sessions;
    if (this.activeId && !sessions.some((s) => s.id === this.activeId)) this.activeId = null;
    this.emit();
  }

  setActive(id: string | null): void {
    if (this.activeId === id) return;
    this.activeId = id;
    this.emit();
  }

  /** Adds a freshly created session at the top without waiting for a reload. */
  add(session: CodeSession): void {
    this.sessions = [session, ...this.sessions.filter((s) => s.id !== session.id)];
    this.activeId = session.id;
    this.emit();
  }

  async remove(id: string): Promise<void> {
    await this.client.deleteSession(id);
    this.sessions = this.sessions.filter((s) => s.id !== id);
    if (this.activeId === id) this.activeId = null;
    this.emit();
  }

  private emit(): void {
    this._onDidChange.fire(this.snapshot);
  }
}
