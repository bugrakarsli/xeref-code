import { describe, expect, it } from 'vitest';
import { baseName, limitLabel, modelLabel, pickModel, relativeTime } from './format';

describe('limitLabel', () => {
  it('maps null to Unlimited and 0 to Not included', () => {
    expect(limitLabel(null)).toBe('Unlimited');
    expect(limitLabel(0)).toBe('Not included');
    expect(limitLabel(3)).toBe('3');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('compacts to now / minutes / hours / days / weeks', () => {
    expect(relativeTime(ago(5_000), now)).toBe('now');
    expect(relativeTime(ago(10 * 60_000), now)).toBe('10m');
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3h');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2d');
    expect(relativeTime(ago(15 * 86_400_000), now)).toBe('2w');
  });

  it('never shows a negative age for a clock-skewed future timestamp', () => {
    expect(relativeTime(new Date(now + 60_000).toISOString(), now)).toBe('now');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(relativeTime('not a date', now)).toBe('');
  });
});

describe('modelLabel', () => {
  it('joins version digits and capitalizes words', () => {
    expect(modelLabel('claude-sonnet-5-5')).toBe('Claude Sonnet 5.5');
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Claude Haiku 4.5');
    expect(modelLabel('xeref-free')).toBe('Xeref Free');
    expect(modelLabel('opus-plan')).toBe('Opus Plan');
  });

  it('keeps known acronyms uppercase and dotted versions intact', () => {
    expect(modelLabel('gpt-5.4')).toBe('GPT 5.4');
    expect(modelLabel('glm-5.3')).toBe('GLM 5.3');
  });
});

describe('pickModel', () => {
  it('uses the preferred model only when the plan allows it', () => {
    expect(pickModel(['xeref-free', 'claude-sonnet-5-5'], 'claude-sonnet-5-5')).toBe('claude-sonnet-5-5');
    expect(pickModel(['xeref-free'], 'claude-opus-5-5')).toBe('xeref-free');
  });

  it('falls back to the free model for an empty list', () => {
    expect(pickModel([], 'anything')).toBe('xeref-free');
  });
});

describe('baseName', () => {
  it('handles posix and windows separators', () => {
    expect(baseName('packages/extension/src/extension.ts')).toBe('extension.ts');
    expect(baseName('packages\\extension\\src\\extension.ts')).toBe('extension.ts');
    expect(baseName('README.md')).toBe('README.md');
  });
});
