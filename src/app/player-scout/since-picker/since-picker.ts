import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ScoutSince } from '../../api/models/scout-since';

/** A day to compare with, as the picker offers it: the preseason line, or so many days back. */
export interface SincePreset {
  readonly label: string;
  /** Days before today; null for the model's line from before the season. */
  readonly days: number | null;
}

export const SINCE_PRESETS: readonly SincePreset[] = [
  { label: 'Preseason', days: null },
  { label: '30 days', days: 30 },
  { label: '14 days', days: 14 },
  { label: '7 days', days: 7 },
  { label: '3 days', days: 3 },
];

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

/** What the two halves of the page are compared against, in a line each. */
export interface SinceCaption {
  readonly projection: string;
  readonly ice: string;
}

/**
 * The caption under the picker: which earlier line the then-lines are, since the day asked for
 * is not always the day answered (nothing is kept from before the history began, and the
 * preseason line stands in), and which games the ice is read over.
 */
export function sinceCaption(answer: ScoutSince | null, since: string | null): SinceCaption {
  const ice =
    since === null
      ? 'Ice: this season so far against last season.'
      : `Ice: his games since ${formatDay(since)} against his games before.`;
  if (!answer) {
    return { projection: '', ice };
  }
  switch (answer.kind) {
    case 'SNAPSHOT': {
      const nearest =
        answer.resolved && answer.requested && answer.resolved !== answer.requested
          ? `, the nearest day kept before ${formatDay(answer.requested)}`
          : '';
      return {
        projection: `Projection: today against the line of ${formatDay(answer.resolved)}${nearest}, re-spread over the games left.`,
        ice,
      };
    }
    case 'PRESEASON':
      if (answer.requested) {
        const begins = answer.earliestSnapshot
          ? `day-by-day lines are kept from ${formatDay(answer.earliestSnapshot)}`
          : 'no day-by-day line is kept yet';
        return {
          projection: `Projection: today against the line from before the season, the newest kept before ${formatDay(answer.requested)} (${begins}), re-spread over the games left.`,
          ice,
        };
      }
      return {
        projection:
          'Projection: today against the line made before the season, re-spread over the games left.',
        ice,
      };
    case 'NONE':
      return {
        projection: 'No earlier projection is stored, so the projection has nothing to compare with yet.',
        ice,
      };
  }
}

/**
 * The day the page compares with: the preseason line or so many days back as a press, or any day
 * from a date field. One day asks both questions, the projection's and the ice's, so the reader
 * never wonders whether the two columns are about the same stretch.
 */
@Component({
  selector: 'app-since-picker',
  templateUrl: './since-picker.html',
  styleUrl: './since-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SincePickerComponent {
  /** The day picked, as an ISO date, or null for the preseason line. */
  readonly since = input.required<string | null>();
  /** What the BFF answered the day with, once it has; null while it loads. */
  readonly answer = input<ScoutSince | null>(null);
  readonly today = input<string>(localToday());
  readonly sinceChange = output<string | null>();

  readonly presets = SINCE_PRESETS;

  /** The press that stands for the day picked, or null when the date field does. */
  readonly active = computed(() => {
    const since = this.since();
    return (
      this.presets.find((preset) =>
        preset.days === null ? since === null : since === daysBefore(this.today(), preset.days),
      ) ?? null
    );
  });

  readonly caption = computed(() => sinceCaption(this.answer(), this.since()));

  /** The earliest day the field offers: the season is never more than a year old. */
  readonly earliest = computed(() => daysBefore(this.today(), 365));

  /** The latest: yesterday, since today's line is the one everything is compared with. */
  readonly latest = computed(() => daysBefore(this.today(), 1));

  pick(preset: SincePreset): void {
    this.sinceChange.emit(preset.days === null ? null : daysBefore(this.today(), preset.days));
  }

  onDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.sinceChange.emit(value);
    }
  }
}
