import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoutSince } from '../../api/models/scout-since';
import { daysBefore, formatDay, sinceCaption, SincePickerComponent } from './since-picker';

const TODAY = '2026-10-14';

describe('the day arithmetic', () => {
  it('counts days back across a month', () => {
    expect(daysBefore(TODAY, 7)).toBe('2026-10-07');
    expect(daysBefore(TODAY, 14)).toBe('2026-09-30');
    expect(daysBefore('2026-01-03', 5)).toBe('2025-12-29');
  });

  it('writes a day as the page does', () => {
    expect(formatDay('2026-10-07')).toBe('7 Oct');
    expect(formatDay(null)).toBe('');
  });
});

describe('sinceCaption', () => {
  const kept: ScoutSince = {
    requested: '2026-10-07',
    kind: 'SNAPSHOT',
    resolved: '2026-10-07',
    earliestSnapshot: '2026-10-01',
  };

  it('says nothing when the day asked for answered, since the picker already shows it', () => {
    expect(sinceCaption(kept)).toEqual('');
  });

  it('says when a nearer day answered than the one asked for', () => {
    expect(sinceCaption({ ...kept, resolved: '2026-10-05' })).toEqual(
      'Compared with 5 Oct, the nearest day kept.',
    );
  });

  it('says the preseason projection stood in for a day nothing is kept from', () => {
    const caption = sinceCaption({
      requested: '2026-10-07',
      kind: 'PRESEASON',
      earliestSnapshot: '2026-10-15',
    });

    expect(caption).toEqual('Days are kept from 15 Oct. Compared with preseason.');
  });

  it('says so when no day-by-day projection is kept at all', () => {
    expect(sinceCaption({ requested: '2026-10-07', kind: 'PRESEASON' })).toEqual(
      'No day is kept yet. Compared with preseason.',
    );
  });

  it('says nothing when the preseason was asked for, since the picker already shows it', () => {
    expect(sinceCaption({ kind: 'PRESEASON' })).toEqual('');
  });

  it('says when there is nothing to compare with, and nothing until the answer lands', () => {
    expect(sinceCaption({ kind: 'NONE' })).toEqual('No earlier projection to compare with yet.');
    expect(sinceCaption(null)).toBe('');
  });
});

describe('SincePickerComponent', () => {
  beforeEach(() => MockBuilder(SincePickerComponent));

  function render(since: string | null, sinceChange = vi.fn()) {
    const fixture = MockRender(SincePickerComponent, { since, today: TODAY, sinceChange });
    return { fixture, sinceChange };
  }

  it('offers the preseason and a day, and marks the one picked', () => {
    const { fixture } = render(null);

    const pills = ngMocks.findAll(fixture, '.pill');
    expect(pills).toHaveLength(2);
    expect(ngMocks.formatText(pills[0])).toBe('Preseason');
    expect(pills[0].attributes['aria-pressed']).toBe('true');
    expect(pills[1].nativeElement.classList).not.toContain('pill--active');
  });

  it('marks the day as the pick once one is set, and keeps it no later than yesterday', () => {
    const { fixture } = render('2026-10-02');

    const field = ngMocks.find(fixture, 'input[type=date]');
    expect(field.attributes['max']).toBe('2026-10-13');
    expect(field.nativeElement.value).toBe('2026-10-02');
    expect(ngMocks.find(fixture, '.date-field').nativeElement.classList).toContain('pill--active');
    expect(ngMocks.findAll(fixture, 'button.pill')[0].attributes['aria-pressed']).toBe('false');
  });

  it('emits null for the preseason and the day typed into the field', () => {
    const { fixture, sinceChange } = render('2026-10-02');
    const field = ngMocks.find(fixture, 'input[type=date]');

    ngMocks.click(ngMocks.find(fixture, 'button.pill'));
    field.nativeElement.value = '2026-10-10';
    field.nativeElement.dispatchEvent(new Event('change'));

    expect(sinceChange.mock.calls).toEqual([[null], ['2026-10-10']]);
  });

  it('hands the field a week back when it is taken up from the preseason', () => {
    const { fixture, sinceChange } = render(null);

    ngMocks.find(fixture, 'input[type=date]').nativeElement.dispatchEvent(new Event('focus'));

    expect(sinceChange).toHaveBeenCalledWith('2026-10-07');
  });

  it('writes the caption under the picker', () => {
    const fixture = MockRender(SincePickerComponent, {
      since: '2026-10-07',
      today: TODAY,
      answer: { requested: '2026-10-07', kind: 'SNAPSHOT', resolved: '2026-10-05' },
    });

    expect(ngMocks.formatText(ngMocks.find(fixture, '.since-caption'))).toEqual(
      'Compared with 5 Oct, the nearest day kept.',
    );
  });
});
