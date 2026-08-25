import { Component, computed, input, model, signal } from '@angular/core';
import { HelpTipComponent } from '../../shared/help-tip/help-tip';
import { Season } from '../season.model';

interface RangePreset {
  label: string;
  /** Resolved against the season's length, so "last 20" means the same stretch in any season. */
  range: (scheduleLength: number) => { from: number; to: number };
}

type Thumb = 'from' | 'to';

const PRESETS: RangePreset[] = [
  { label: 'Last 10', range: (games) => ({ from: Math.max(1, games - 9), to: games }) },
  { label: 'Last 20', range: (games) => ({ from: Math.max(1, games - 19), to: games }) },
  { label: 'Last 30', range: (games) => ({ from: Math.max(1, games - 29), to: games }) },
  { label: 'First half', range: (games) => ({ from: 1, to: Math.ceil(games / 2) }) },
  { label: 'Second half', range: (games) => ({ from: Math.ceil(games / 2) + 1, to: games }) },
  { label: 'Full season', range: (games) => ({ from: 1, to: games }) },
];

/**
 * Picks the stretch of schedule to measure, in team game numbers.
 *
 * Game numbers rather than dates, because they are the unit the whole feature is expressed in:
 * every team plays its 41st game at a different time, but "games 50-82" is the same closing
 * stretch of the season for all of them.
 *
 * The two bounds share one track: two native range inputs stacked on the same rail, each
 * contributing a handle. Two sliders would let the eye read them as independent settings when
 * they are really one interval, and it costs twice the height for half the meaning.
 *
 * The bounds push each other rather than allowing an impossible range — dragging `from` past
 * `to` takes `to` with it, which is what a user reaching for a later window means.
 */
@Component({
  selector: 'app-game-range-selector',
  imports: [HelpTipComponent],
  templateUrl: './game-range-selector.html',
  styleUrl: './game-range-selector.css',
})
export class GameRangeSelectorComponent {
  readonly seasons = input.required<readonly Season[]>();
  readonly season = model.required<number>();
  readonly scheduleLength = input.required<number>();
  readonly fromGame = model.required<number>();
  readonly toGame = model.required<number>();
  readonly perGame = model.required<boolean>();
  readonly minGames = model.required<number>();

  readonly presets = PRESETS;

  /**
   * Which handle the pointer is closest to. Stacked handles overlap when the range is narrow,
   * and hit testing happens before any event reaches us — so the winner has to be decided on
   * hover, while there is still time to raise it above the other one.
   */
  readonly activeThumb = signal<Thumb>('to');

  readonly spanLength = computed(() => this.toGame() - this.fromGame() + 1);

  /**
   * Only the span length. The two bounds sit in the boxes at either end of the rail, so
   * repeating them here would be the same fact twice — the count is the one thing the row
   * cannot be read off directly.
   */
  readonly summary = computed(() => {
    const games = this.spanLength();
    return `${games} game${games === 1 ? '' : 's'}`;
  });

  /** The band between the handles, drawn on the rail behind them. */
  readonly fillStyle = computed(() => ({
    left: this.railOffset(this.positionOf(this.fromGame())),
    right: this.railOffset(1 - this.positionOf(this.toGame())),
  }));

  readonly isPresetActive = computed(() => {
    const { from, to } = { from: this.fromGame(), to: this.toGame() };
    return (preset: RangePreset) => {
      const resolved = preset.range(this.scheduleLength());
      return resolved.from === from && resolved.to === to;
    };
  });

  applyPreset(preset: RangePreset): void {
    const { from, to } = preset.range(this.scheduleLength());
    this.fromGame.set(from);
    this.toGame.set(to);
  }

  onFromInput(event: Event): void {
    const value = this.clamp(event);
    this.fromGame.set(value);
    if (value > this.toGame()) {
      this.toGame.set(value);
    }
  }

  onToInput(event: Event): void {
    const value = this.clamp(event);
    this.toGame.set(value);
    if (value < this.fromGame()) {
      this.fromGame.set(value);
    }
  }

  /** Only a season that is actually on offer: `Number('')` is 0, which is finite and is not one. */
  onSeasonChange(event: Event): void {
    const startYear = Number((event.target as HTMLSelectElement).value);
    if (this.seasons().some((season) => season.startYear === startYear)) {
      this.season.set(startYear);
    }
  }

  onMinGamesInput(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(raw)) {
      this.minGames.set(Math.min(this.spanLength(), Math.max(1, Math.round(raw))));
    }
  }

  togglePerGame(): void {
    this.perGame.update((on) => !on);
  }

  /**
   * A press already in progress owns the interaction through pointer capture, so swapping the
   * handles underneath it would only make the one being dragged flicker behind the other.
   */
  onTrackHover(event: PointerEvent): void {
    if (event.buttons !== 0) {
      return;
    }
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (bounds.width === 0) {
      return;
    }
    const pointer = (event.clientX - bounds.left) / bounds.width;
    const toFrom = Math.abs(pointer - this.positionOf(this.fromGame()));
    const toTo = Math.abs(pointer - this.positionOf(this.toGame()));
    this.activeThumb.set(toFrom <= toTo ? 'from' : 'to');
  }

  /** Where a game number sits along the track, 0 at the first game and 1 at the last. */
  private positionOf(game: number): number {
    const span = Math.max(1, this.scheduleLength() - 1);
    return Math.min(1, Math.max(0, (game - 1) / span));
  }

  /**
   * A handle's centre never reaches the very end of the track — it stops half a handle short at
   * either end. The band has to follow the same inset, or it drifts out from under the handles
   * as they approach the edges.
   */
  private railOffset(fraction: number): string {
    return `calc(${(fraction * 100).toFixed(3)}% + ${(0.5 - fraction).toFixed(4)} * var(--thumb-size))`;
  }

  private clamp(event: Event): number {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) {
      return this.fromGame();
    }
    return Math.min(this.scheduleLength(), Math.max(1, Math.round(raw)));
  }
}
