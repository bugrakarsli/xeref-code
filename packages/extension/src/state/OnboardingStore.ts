import * as vscode from 'vscode';
import type { MilestoneId, OnboardingState } from '../shared/messages';

const KEY = 'xeref.onboarding';

interface Persisted {
  done: MilestoneId[];
  learnDismissed: boolean;
  whatsNewSeen: string | null;
}

/** Learn-card progress and What's New dismissal, persisted per user (VS Code globalState). */
export class OnboardingStore {
  private readonly _onDidChange = new vscode.EventEmitter<OnboardingState>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly memento: vscode.Memento,
    private readonly version: string
  ) {}

  get state(): OnboardingState {
    return { ...this.read(), version: this.version };
  }

  /** Marks a milestone done. Idempotent; only fires when something changed. */
  async complete(id: MilestoneId): Promise<void> {
    const p = this.read();
    if (p.done.includes(id)) return;
    await this.write({ ...p, done: [...p.done, id] });
  }

  async dismiss(what: 'learn' | 'whatsNew'): Promise<void> {
    const p = this.read();
    await this.write(what === 'learn' ? { ...p, learnDismissed: true } : { ...p, whatsNewSeen: this.version });
  }

  private read(): Persisted {
    const raw = this.memento.get<Partial<Persisted>>(KEY);
    return {
      done: Array.isArray(raw?.done) ? raw.done : [],
      learnDismissed: raw?.learnDismissed === true,
      whatsNewSeen: typeof raw?.whatsNewSeen === 'string' ? raw.whatsNewSeen : null,
    };
  }

  private async write(next: Persisted): Promise<void> {
    await this.memento.update(KEY, next);
    this._onDidChange.fire(this.state);
  }
}
