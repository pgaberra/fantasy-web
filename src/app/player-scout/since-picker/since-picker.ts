import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ScoutSince } from '../../api/models/scout-since';

/** Today as an ISO date in the reader's own clock, the way a date input writes one. */
export function localToday(): string {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

/** `days` before an ISO date, as an ISO date. */
export function daysBefore(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const then = new Date(year, month - 1, date - days);
  return isoDate(then.getFullYear(), then.getMonth(), then.getDate());
}

function isoDate(year: number, monthIndex: number, date: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** An ISO date as the page writes one: "7 Oct". */
export function formatDay(day: string | null | undefined): string {
  if (!day) {
    return '';
  }
  const [year, month, date] = day.split('-').map(Number);
  return DAY.format(new Date(year, month - 1, date));
}

/**
 * The caption under the picker: which earlier projection the comparison is with, since the day
 * asked for is not always the day answered (nothing is kept from before the history began, and
 * the preseason projection stands in).
 */
export function sinceCaption(answer: ScoutSince | null): string {
  if (!answer) {
    return '';
  }
  switch (answer.kind) {
    case 'SNAPSHOT': {
      const nearest =
        answer.resolved && answer.requested && answer.resolved !== answer.requested
          ? `, the nearest day kept before ${formatDay(answer.requested)}`
          : '';
      return `Today's projection against the one of ${formatDay(answer.resolved)}${nearest}, re-spread over the games left.`;
    }
    case 'PRESEASON':
      if (answer.requested) {
        const begins = answer.earliestSnapshot
          ? `day-by-day projections are kept from ${formatDay(answer.earliestSnapshot)}`
          : 'no day-by-day projection is kept yet';
        return `Nothing is kept from before ${formatDay(answer.requested)} (${begins}), so this is today's projection against the one made before the season, re-spread over the games left.`;
      }
      return `Today's projection against the one made before the season, re-spread over the games left.`;
    case 'NONE':
      return 'No earlier projection is stored, so there is nothing to compare with yet.';
  }
  return '';
}

/**
 * The comparison, as one choice of three: off, the projection from before the season, or the one
 * of any day of the reader's own. The model is re-run every night, so each day is a projection
 * of its own; the page's caption says which day actually answered ({@link sinceCaption}).
 *
 * <p>Off and a day are the one control rather than a tick and a picker under it (Alexander,
 * 2026-10-15): the tick said "compare", the picker said "with what", and the two took three lines
 * to say one thing.
 */
@Component({
  selector: 'app-since-picker',
  templateUrl: './since-picker.html',
  styleUrl: './since-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SincePickerComponent {
  /** Whether a comparison is on at all. Off, the day below is kept but not asked. */
  readonly on = input.required<boolean>();
  /** The day picked, as an ISO date, or null for the preseason projection. */
  readonly since = input.required<string | null>();
  readonly today = input<string>(localToday());
  /** The preseason (null) or a day picked, which also switches the comparison on. */
  readonly sinceChange = output<string | null>();
  /** Off pressed: the comparison switched off, the day kept for next time. */
  readonly cleared = output<void>();

  /** The earliest day the field offers: the season is never more than a year old. */
  readonly earliest = computed(() => daysBefore(this.today(), 365));

  /** The latest: yesterday, since today's projection is the one everything is compared with. */
  readonly latest = computed(() => daysBefore(this.today(), 1));

  /** The day the field opens on when no day is picked: a week back, a usual look. */
  readonly suggested = computed(() => daysBefore(this.today(), 7));

  pickOff(): void {
    this.cleared.emit();
  }

  pickPreseason(): void {
    this.sinceChange.emit(null);
  }

  /**
   * The date field taken up while it is not the pick: the day it holds, or a week back when it
   * holds none, so the comparison is on the moment the field is touched.
   */
  pickDay(): void {
    if (!this.on() || this.since() === null) {
      this.sinceChange.emit(this.since() ?? this.suggested());
    }
  }

  onDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.sinceChange.emit(value);
    }
  }
}
