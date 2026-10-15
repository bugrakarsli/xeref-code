import type { MilestoneId, ModelId, Plan } from '@xeref-code/shared-types';

export const PLAN_LABEL: Record<Plan, string> = { free: 'Free', pro: 'Pro', ultra: 'Ultra' };

/** Onboarding steps in display order. Completion is detected by the host, not ticked by hand. */
export const MILESTONES: readonly { id: MilestoneId; title: string }[] = [
  { id: 'connect', title: 'Connect your Xeref account' },
  { id: 'firstChat', title: 'Ask Xeref to write code' },
  { id: 'sendSelection', title: 'Send a selection from the editor' },
  { id: 'reviewEdit', title: 'Review and approve an edit' },
  { id: 'tryModel', title: 'Try a different model' },
];

/** A plan limit as text: `null` is unlimited, 0 means the plan does not include the feature. */
export function limitLabel(limit: number | null): string {
  if (limit === null) return 'Unlimited';
  if (limit === 0) return 'Not included';
  return String(limit);
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** Compact "time ago" for the session list: now, 5m, 3h, 2d, 4w. Empty string for bad input. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

const ACRONYMS: Record<string, string> = { gpt: 'GPT', glm: 'GLM', xeref: 'Xeref', kimi: 'Kimi', qwen: 'Qwen' };

/**
 * Readable model name from a server model id: `claude-sonnet-5-5` -> "Claude Sonnet 5.5",
 * `gpt-5.4` -> "GPT 5.4". Unknown ids still read sensibly; nothing here needs a lookup table.
 */
export function modelLabel(id: ModelId): string {
  const out: string[] = [];
  // A trailing 8-digit token is a release date stamp (claude-haiku-4-5-20251001); not part of the name.
  for (const token of id.split('-').filter((t) => t && !/^\d{8}$/.test(t))) {
    const previous = out[out.length - 1];
    if (/^\d+$/.test(token) && previous !== undefined && /^\d+(\.\d+)*$/.test(previous)) {
      out[out.length - 1] = `${previous}.${token}`;
    } else {
      out.push(ACRONYMS[token] ?? token.charAt(0).toUpperCase() + token.slice(1));
    }
  }
  return out.join(' ');
}

/** The configured default if the plan allows it, else the first allowed model, else the free model. */
export function pickModel(allowed: readonly ModelId[], preferred: ModelId): ModelId {
  if (allowed.includes(preferred)) return preferred;
  return allowed[0] ?? 'xeref-free';
}

/** Last path segment, for the active-file chip (full path stays in the tooltip). */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
