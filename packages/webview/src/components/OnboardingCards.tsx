import type { MilestoneId, OnboardingState } from '@xeref-code/shared-types';
import { postToHost } from '../lib/vscodeApi';
import { MILESTONES } from '../lib/format';
import { Icon, XerefMark } from './Icon';

/** Checklist that fills in as the host sees each step happen. "Show me" runs the step for you. */
export function LearnCard({ state }: { state: OnboardingState }) {
  if (state.learnDismissed) return null;

  const done = new Set<MilestoneId>(state.done);
  const next = MILESTONES.find((m) => !done.has(m.id))?.id ?? null;
  const complete = next === null;

  return (
    <section className="x-card" aria-label="Learn Xeref Code">
      <div className="x-card-header">
        <span className="x-card-title">
          <XerefMark size={16} /> Learn Xeref Code
        </span>
        <button
          className="x-icon-btn"
          onClick={() => postToHost({ type: 'onboarding.dismiss', what: 'learn' })}
          aria-label="Dismiss Learn Xeref Code"
        >
          <Icon name="close" />
        </button>
      </div>

      <ul className="x-checklist">
        {MILESTONES.map((m) => {
          const isDone = done.has(m.id);
          return (
            <li key={m.id} className={`x-check-row${m.id === next ? ' is-next' : ''}`}>
              <span className={`x-check${isDone ? ' is-done' : ''}`} role="img" aria-label={isDone ? 'Done' : 'Not done'}>
                {isDone && <Icon name="check" size={12} />}
              </span>
              <span className="x-check-text">{m.title}</span>
              {!isDone && (
                <button
                  className="x-btn x-btn-small"
                  onClick={() => postToHost({ type: 'onboarding.step', id: m.id })}
                  aria-label={`Show me: ${m.title}`}
                >
                  Show me
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {complete && (
        <div className="x-card-footer">
          <span className="x-muted">You are all set.</span>
          <button className="x-btn x-btn-primary x-btn-small" onClick={() => postToHost({ type: 'onboarding.dismiss', what: 'learn' })}>
            Finish
          </button>
        </div>
      )}
    </section>
  );
}

const WHATS_NEW: readonly string[] = [
  'Account & usage: see your plan and activity, with a details popup.',
  'Sessions: search and delete from one list.',
  'The message box now has model and edit-mode chips.',
];

/** One-time card per extension version. */
export function WhatsNewCard({ state }: { state: OnboardingState }) {
  if (state.whatsNewSeen === state.version) return null;

  return (
    <section className="x-card x-card-accent" aria-label={`What's new in Xeref Code ${state.version}`}>
      <div className="x-card-header">
        <span className="x-card-title">What&apos;s new in {state.version}</span>
        <button
          className="x-icon-btn"
          onClick={() => postToHost({ type: 'onboarding.dismiss', what: 'whatsNew' })}
          aria-label="Dismiss what's new"
        >
          <Icon name="close" />
        </button>
      </div>
      <ul className="x-bullets">
        {WHATS_NEW.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
