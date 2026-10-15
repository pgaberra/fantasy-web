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
      return answer.resolved && answer.requested && answer.resolved !== answer.requested
        ? `Compared with ${formatDay(answer.resolved)}, the nearest day kept.`
        : '';
    }
    case 'PRESEASON':
      if (answer.requested) {
        return answer.earliestSnapshot
          ? `Days are kept from ${formatDay(answer.earliestSnapshot)}. Compared with preseason.`
          : 'No day is kept yet. Compared with preseason.';
      }
      return '';
    case 'NONE':
      return 'No earlier projection to compare with yet.';
  }
  return '';
}

/**
 * The earlier projection to compare with: the one from before the season, or the one of any day
 * of the reader's own. The model is re-run every night, so each day is a projection of its own,
 * and the caption says which day actually answered.
 */
@Component({
  selector: 'app-since-picker',
  templateUrl: './since-picker.html',
  styleUrl: './since-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SincePickerComponent {
  /** The day picked, as an ISO date, or null for the preseason projection. */
  readonly since = input.required<string | null>();
  /** What the BFF answered the day with, once it has; null while it loads. */
  readonly answer = input<ScoutSince | null>(null);
  readonly today = input<string>(localToday());
  readonly sinceChange = output<string | null>();

  readonly caption = computed(() => sinceCaption(this.answer()));

  /** The earliest day the field offers: the season is never more than a year old. */
  readonly earliest = computed(() => daysBefore(this.today(), 365));

  /** The latest: yesterday, since today's projection is the one everything is compared with. */
  readonly latest = computed(() => daysBefore(this.today(), 1));

  /** The day the field opens on when the preseason is picked: a week back, a usual look. */
  readonly suggested = computed(() => daysBefore(this.today(), 7));

  pickPreseason(): void {
    this.sinceChange.emit(null);
  }

  /** The date field taken up while the preseason is picked: hand it a day to start from. */
  pickDay(): void {
    if (this.since() === null) {
      this.sinceChange.emit(this.suggested());
    }
  }

  onDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.sinceChange.emit(value);
    }
  }
}
