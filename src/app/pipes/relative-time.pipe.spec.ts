import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  beforeEach(() => MockBuilder(RelativeTimePipe));

  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
  const render = (value: string | null) =>
    MockRender('{{ value | relativeTime }}', { value }).nativeElement.textContent;

  it('shows "just now" for very recent timestamps', () => {
    expect(render(ago(5))).toEqual('just now');
  });

  it('shows minutes ago', () => {
    expect(render(ago(5 * 60))).toEqual('5 minutes ago');
  });

  it('shows hours ago', () => {
    expect(render(ago(2 * 60 * 60))).toEqual('2 hours ago');
  });

  it('shows days ago within a week', () => {
    expect(render(ago(3 * 24 * 60 * 60))).toEqual('3 days ago');
  });

  it('falls back to an absolute date for older timestamps', () => {
    const old = new Date('2026-01-15T12:00:00Z');
    const result = render(old.toISOString());
    expect(result).toContain('2026');
    expect(result).not.toContain('ago');
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(render(null)).toEqual('');
    expect(render('not-a-date')).toEqual('');
  });
});
