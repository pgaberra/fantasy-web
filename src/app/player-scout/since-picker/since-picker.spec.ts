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

  it("says which day's projection answered", () => {
    expect(sinceCaption(kept)).toBe(
      "Today's projection against the one of 7 Oct, re-spread over the games left.",
    );
  });

  it('says when a nearer day answered than the one asked for', () => {
    expect(sinceCaption({ ...kept, resolved: '2026-10-05' })).toContain(
      'the one of 5 Oct, the nearest day kept before 7 Oct',
    );
  });

  it('says the preseason projection stood in for a day nothing is kept from', () => {
    const caption = sinceCaption({
      requested: '2026-10-07',
      kind: 'PRESEASON',
      earliestSnapshot: '2026-10-15',
    });

    expect(caption).toContain('Nothing is kept from before 7 Oct');
    expect(caption).toContain('day-by-day projections are kept from 15 Oct');
    expect(caption).toContain('the one made before the season');
  });

  it('says so when no day-by-day projection is kept at all', () => {
    expect(sinceCaption({ requested: '2026-10-07', kind: 'PRESEASON' })).toContain(
      'no day-by-day projection is kept yet',
    );
  });

  it('names the preseason plainly when it was asked for', () => {
    expect(sinceCaption({ kind: 'PRESEASON' })).toBe(
      "Today's projection against the one made before the season, re-spread over the games left.",
    );
  });

  it('says when there is nothing to compare with, and nothing until the answer lands', () => {
    expect(sinceCaption({ kind: 'NONE' })).toContain('nothing to compare with');
    expect(sinceCaption(null)).toBe('');
  });
});

describe('SincePickerComponent', () => {
  beforeEach(() => MockBuilder(SincePickerComponent));

  function render(on: boolean, since: string | null, sinceChange = vi.fn(), cleared = vi.fn()) {
    const fixture = MockRender(SincePickerComponent, {
      on,
      since,
      today: TODAY,
      sinceChange,
      cleared,
    });
    return { fixture, sinceChange, cleared };
  }

  const segments = (fixture: ReturnType<typeof render>['fixture']) =>
    ngMocks.findAll(fixture, '.segment');

  it('offers off, the preseason and a day, and marks off while no comparison is on', () => {
    const { fixture } = render(false, null);

    const all = segments(fixture);
    expect(all).toHaveLength(3);
    expect(all.map((segment) => ngMocks.formatText(segment))).toEqual([
      'Off',
      'Preseason',
      'a day',
    ]);
    expect(all[0].attributes['aria-pressed']).toBe('true');
    expect(all[1].nativeElement.classList).not.toContain('segment--active');
    expect(all[2].nativeElement.classList).not.toContain('segment--active');
  });

  it('marks the preseason as the pick once the comparison is on with no day', () => {
    const { fixture } = render(true, null);

    const all = segments(fixture);
    expect(all[0].attributes['aria-pressed']).toBe('false');
    expect(all[1].attributes['aria-pressed']).toBe('true');
  });

  it('marks the day as the pick once one is set, and keeps it no later than yesterday', () => {
    const { fixture } = render(true, '2026-10-02');

    const field = ngMocks.find(fixture, 'input[type=date]');
    expect(field.attributes['max']).toBe('2026-10-13');
    expect(field.nativeElement.value).toBe('2026-10-02');
    expect(ngMocks.find(fixture, '.date-field').nativeElement.classList).toContain(
      'segment--active',
    );
    expect(segments(fixture)[1].attributes['aria-pressed']).toBe('false');
  });

  it('emits null for the preseason and the day typed into the field, and off for off', () => {
    const { fixture, sinceChange, cleared } = render(true, '2026-10-02');
    const field = ngMocks.find(fixture, 'input[type=date]');

    ngMocks.click(segments(fixture)[1]);
    field.nativeElement.value = '2026-10-10';
    field.nativeElement.dispatchEvent(new Event('change'));
    ngMocks.click(segments(fixture)[0]);

    expect(sinceChange.mock.calls).toEqual([[null], ['2026-10-10']]);
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('hands the field a week back when it is taken up from the preseason', () => {
    const { fixture, sinceChange } = render(true, null);

    ngMocks.find(fixture, 'input[type=date]').nativeElement.dispatchEvent(new Event('focus'));

    expect(sinceChange).toHaveBeenCalledWith('2026-10-07');
  });

  it('switches the comparison back on against the day it kept when the field is taken up', () => {
    const { fixture, sinceChange } = render(false, '2026-10-02');

    ngMocks.find(fixture, 'input[type=date]').nativeElement.dispatchEvent(new Event('focus'));

    expect(sinceChange).toHaveBeenCalledWith('2026-10-02');
  });

  it('leaves the pick alone when the field is taken up while it is the pick', () => {
    const { fixture, sinceChange } = render(true, '2026-10-02');

    ngMocks.find(fixture, 'input[type=date]').nativeElement.dispatchEvent(new Event('focus'));

    expect(sinceChange).not.toHaveBeenCalled();
  });
});
