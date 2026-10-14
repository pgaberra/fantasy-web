import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScoutSince } from '../../api/models/scout-since';
import {
  daysBefore,
  formatDay,
  sinceCaption,
  SincePickerComponent,
} from './since-picker';

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

  it("says which day's line answered, and which games the ice is read over", () => {
    const caption = sinceCaption(kept, '2026-10-07');

    expect(caption.projection).toBe(
      'Projection: today against the line of 7 Oct, re-spread over the games left.',
    );
    expect(caption.ice).toBe('Ice: his games since 7 Oct against his games before.');
  });

  it('says when a nearer day answered than the one asked for', () => {
    const caption = sinceCaption({ ...kept, resolved: '2026-10-05' }, '2026-10-07');

    expect(caption.projection).toContain('the line of 5 Oct, the nearest day kept before 7 Oct');
  });

  it('says the preseason line stood in for a day nothing is kept from', () => {
    const caption = sinceCaption(
      { requested: '2026-10-07', kind: 'PRESEASON', earliestSnapshot: '2026-10-15' },
      '2026-10-07',
    );

    expect(caption.projection).toContain('the line from before the season');
    expect(caption.projection).toContain('day-by-day lines are kept from 15 Oct');
  });

  it('says so when no day-by-day line is kept at all', () => {
    const caption = sinceCaption({ requested: '2026-10-07', kind: 'PRESEASON' }, '2026-10-07');

    expect(caption.projection).toContain('no day-by-day line is kept yet');
  });

  it('reads the preseason as last season on the ice', () => {
    const caption = sinceCaption({ kind: 'PRESEASON' }, null);

    expect(caption.projection).toBe(
      'Projection: today against the line made before the season, re-spread over the games left.',
    );
    expect(caption.ice).toBe('Ice: this season so far against last season.');
  });

  it('says when there is nothing to compare with', () => {
    expect(sinceCaption({ kind: 'NONE' }, null).projection).toContain('nothing to compare with');
  });

  it('has only the ice to say until the answer lands', () => {
    expect(sinceCaption(null, '2026-10-07').projection).toBe('');
  });
});

describe('SincePickerComponent', () => {
  beforeEach(() => MockBuilder(SincePickerComponent));

  function render(since: string | null, sinceChange = vi.fn()) {
    const fixture = MockRender(SincePickerComponent, { since, today: TODAY, sinceChange });
    return { fixture, sinceChange };
  }

  it('offers the preseason and a few days back as presses, and marks the one picked', () => {
    const { fixture } = render('2026-10-07');

    const pills = ngMocks.findAll(fixture, '.pill');
    expect(pills.map((pill) => ngMocks.formatText(pill))).toEqual([
      'Preseason',
      '30 days',
      '14 days',
      '7 days',
      '3 days',
    ]);
    expect(pills.map((pill) => pill.attributes['aria-pressed'])).toEqual([
      'false',
      'false',
      'false',
      'true',
      'false',
    ]);
  });

  it('emits the day a press stands for, and null for the preseason', () => {
    const { fixture, sinceChange } = render(null);
    const pills = ngMocks.findAll(fixture, '.pill');

    ngMocks.click(pills[2]);
    ngMocks.click(pills[0]);

    expect(sinceChange.mock.calls).toEqual([['2026-09-30'], [null]]);
  });

  it('takes any day from the field, no later than yesterday, and marks the field as the pick', () => {
    const { fixture, sinceChange } = render('2026-10-02');
    const field = ngMocks.find(fixture, 'input[type=date]');

    expect(field.attributes['max']).toBe('2026-10-13');
    expect(field.nativeElement.value).toBe('2026-10-02');
    expect(ngMocks.find(fixture, '.date-field').nativeElement.classList).toContain(
      'date-field--active',
    );
    expect(ngMocks.findAll(fixture, '.pill[aria-pressed=true]')).toHaveLength(0);

    field.nativeElement.value = '2026-10-10';
    field.nativeElement.dispatchEvent(new Event('change'));

    expect(sinceChange).toHaveBeenCalledWith('2026-10-10');
  });

  it('writes the caption under the picker', () => {
    const fixture = MockRender(SincePickerComponent, {
      since: '2026-10-07',
      today: TODAY,
      answer: { requested: '2026-10-07', kind: 'SNAPSHOT', resolved: '2026-10-07' },
    });

    expect(ngMocks.formatText(ngMocks.find(fixture, '.since-caption'))).toContain(
      'the line of 7 Oct',
    );
  });
});
