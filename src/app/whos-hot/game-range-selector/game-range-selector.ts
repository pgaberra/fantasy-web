import { Component, computed, input, model } from '@angular/core';

interface RangePreset {
  label: string;
  /** Resolved against the season's length, so "last 20" means the same stretch in any season. */
  range: (scheduleLength: number) => { from: number; to: number };
}

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
 * The two bounds push each other rather than allowing an impossible range — dragging `from`
 * past `to` takes `to` with it, which is what a user reaching for a later window means.
 */
@Component({
  selector: 'app-game-range-selector',
  templateUrl: './game-range-selector.html',
  styleUrl: './game-range-selector.css',
})
export class GameRangeSelectorComponent {
  readonly seasonLabel = input.required<string>();
  readonly scheduleLength = input.required<number>();
  readonly fromGame = model.required<number>();
  readonly toGame = model.required<number>();
  readonly perGame = model.required<boolean>();
  readonly minGames = model.required<number>();

  readonly presets = PRESETS;

  readonly spanLength = computed(() => this.toGame() - this.fromGame() + 1);

  readonly summary = computed(() => {
    const games = this.spanLength();
    return `${games} game${games === 1 ? '' : 's'} · #${this.fromGame()}–${this.toGame()}`;
  });

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

  onMinGamesInput(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(raw)) {
      this.minGames.set(Math.min(this.spanLength(), Math.max(1, Math.round(raw))));
    }
  }

  togglePerGame(): void {
    this.perGame.update((on) => !on);
  }

  private clamp(event: Event): number {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) {
      return this.fromGame();
    }
    return Math.min(this.scheduleLength(), Math.max(1, Math.round(raw)));
  }
}
