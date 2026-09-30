import { Component, computed, input, model, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpTipComponent } from '../../shared/help-tip/help-tip';
import { IconComponent } from '../../shared/icon/icon';

/**
 * "The last N games", sent to the server as a count. Each team's own last N is counted back from
 * the latest game that team has played, so mid-season, when teams stand on different game
 * numbers, no pair of bounds could say it.
 */
export interface LastGamesPreset {
  label: string;
  lastGames: number;
}

/** A stretch fixed by the season's length, the same game numbers for every team. */
export interface SpanPreset {
  label: string;
  range: (scheduleLength: number) => { from: number; to: number };
}

export type RangePreset = LastGamesPreset | SpanPreset;

type Thumb = 'from' | 'to';

/**
 * The one range a free account gets: the most recent form, which is what the page is for at its
 * simplest. Everything else about the range — the other presets and the rail — is premium.
 *
 * Exported because the page has to agree with the pills about what "the free range" is: it opens
 * on this range and falls back to it when an account is not premium, and two independent
 * definitions of "last 5" would drift the first time one of them changed.
 */
export const FREE_PRESET: LastGamesPreset = { label: 'Last 5', lastGames: 5 };

/**
 * Where the rail starts: before the season's first game. A range reaching back this far holds
 * everyone's season from its start, so it takes in the players who have not played a game in it
 * yet too — on the board with nothing measured, rather than missing from it.
 *
 * That is what "the last 5" is a few nights into a season, when no team has played five and some
 * have played none: games 0-2. Drawn as 1-2 it asked only about players who had dressed, so every
 * team yet to play was absent from the board, and the board read as though it hid them. The first
 * half and the full season start here too, since both run from the season's start.
 */
export const BEFORE_FIRST_GAME = 0;

/** The first game there is. A range that starts here measures only the players who dressed. */
export const FIRST_GAME = 1;

/**
 * Where "the last N" falls on the rail: back from the latest game the season has reached, and no
 * further back than its start. The server counts each team's own last N, so this is only where
 * the rail draws it.
 */
export function lastGamesRange(
  latestGame: number,
  lastGames: number,
): { from: number; to: number } {
  return { from: Math.max(BEFORE_FIRST_GAME, latestGame - lastGames + 1), to: latestGame };
}

/** How many games a range covers. Starting before the first game adds none. */
export function gamesIn(fromGame: number, toGame: number): number {
  return toGame - Math.max(FIRST_GAME, fromGame) + 1;
}

const PRESETS: RangePreset[] = [
  FREE_PRESET,
  { label: 'Last 10', lastGames: 10 },
  { label: 'Last 20', lastGames: 20 },
  { label: 'Last 30', lastGames: 30 },
  {
    label: 'First half',
    range: (games) => ({ from: BEFORE_FIRST_GAME, to: Math.ceil(games / 2) }),
  },
  { label: 'Second half', range: (games) => ({ from: Math.ceil(games / 2) + 1, to: games }) },
  { label: 'Full season', range: (games) => ({ from: BEFORE_FIRST_GAME, to: games }) },
];

function isLastGames(preset: RangePreset): preset is LastGamesPreset {
  return 'lastGames' in preset;
}

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
 *
 * A "Last N" pill is kept as `lastGames` and the rail only shows where it falls, back from
 * `latestGame`. Moving either handle turns it into the explicit range it was showing.
 */
@Component({
  selector: 'app-game-range-selector',
  imports: [HelpTipComponent, RouterLink, IconComponent],
  templateUrl: './game-range-selector.html',
  styleUrl: './game-range-selector.css',
})
export class GameRangeSelectorComponent {
  /** The selected season's own length: 82 games in 2025-26, 84 in 2026-27. */
  readonly scheduleLength = input.required<number>();

  /** The furthest the season has got, which is where "the last N" is drawn back from. */
  readonly latestGame = input.required<number>();

  /**
   * Whether picking the range is closed to this account. Everything that moves the bounds goes
   * flat: the presets other than the free one, the rail and the two boxes. The free preset stays
   * live so the row still reads as a choice that has been made rather than a dead strip, and the
   * lock beside it says who the rest is for.
   */
  readonly locked = input(false);
  readonly fromGame = model.required<number>();
  readonly toGame = model.required<number>();
  readonly lastGames = model.required<number | null>();
  readonly perGame = model.required<boolean>();
  readonly minGames = model.required<number>();

  readonly presets = PRESETS;
  readonly railStart = BEFORE_FIRST_GAME;
  readonly firstGame = FIRST_GAME;

  /**
   * Which handle the pointer is closest to. Stacked handles overlap when the range is narrow,
   * and hit testing happens before any event reaches us — so the winner has to be decided on
   * hover, while there is still time to raise it above the other one.
   */
  readonly activeThumb = signal<Thumb>('to');

  readonly spanLength = computed(() => gamesIn(this.fromGame(), this.toGame()));

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

  /** Every preset but the free one, once the range is locked. */
  readonly isPresetLocked = computed(() => {
    const locked = this.locked();
    return (preset: RangePreset) => locked && preset !== FREE_PRESET;
  });

  readonly isPresetActive = computed(() => {
    const lastGames = this.lastGames();
    const { from, to } = { from: this.fromGame(), to: this.toGame() };
    const scheduleLength = this.scheduleLength();
    return (preset: RangePreset) => {
      if (isLastGames(preset)) {
        return lastGames === preset.lastGames;
      }
      const resolved = preset.range(scheduleLength);
      return lastGames === null && resolved.from === from && resolved.to === to;
    };
  });

  applyPreset(preset: RangePreset): void {
    if (isLastGames(preset)) {
      const { from, to } = lastGamesRange(this.latestGame(), preset.lastGames);
      this.lastGames.set(preset.lastGames);
      this.fromGame.set(from);
      this.toGame.set(to);
      return;
    }
    const { from, to } = preset.range(this.scheduleLength());
    this.lastGames.set(null);
    this.fromGame.set(from);
    this.toGame.set(to);
  }

  /** The start may reach back before the first game; see {@link BEFORE_FIRST_GAME}. */
  onFromInput(event: Event): void {
    const value = this.clamp(event, BEFORE_FIRST_GAME);
    this.lastGames.set(null);
    this.fromGame.set(value);
    if (value > this.toGame()) {
      this.toGame.set(value);
    }
  }

  /** The end may not: a range has to hold at least one game to measure. */
  onToInput(event: Event): void {
    const value = this.clamp(event, FIRST_GAME);
    this.lastGames.set(null);
    this.toGame.set(value);
    if (value < this.fromGame()) {
      this.fromGame.set(value);
    }
  }

  /**
   * Held to the season rather than to the range. The minimum is a setting of its own, not a
   * function of the stretch it happens to be typed against: moving the range must never change
   * the number in this box. The page holds the filter itself to the range it is applied to.
   */
  onMinGamesInput(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(raw)) {
      this.minGames.set(Math.min(this.scheduleLength(), Math.max(1, Math.round(raw))));
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

  /** Where a game number sits along the track, 0 before the first game and 1 at the last. */
  private positionOf(game: number): number {
    const span = Math.max(1, this.scheduleLength() - BEFORE_FIRST_GAME);
    return Math.min(1, Math.max(0, (game - BEFORE_FIRST_GAME) / span));
  }

  /**
   * A handle's centre never reaches the very end of the track — it stops half a handle short at
   * either end. The band has to follow the same inset, or it drifts out from under the handles
   * as they approach the edges.
   */
  private railOffset(fraction: number): string {
    return `calc(${(fraction * 100).toFixed(3)}% + ${(0.5 - fraction).toFixed(4)} * var(--thumb-size))`;
  }

  private clamp(event: Event, lowest: number): number {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) {
      return this.fromGame();
    }
    return Math.min(this.scheduleLength(), Math.max(lowest, Math.round(raw)));
  }
}
