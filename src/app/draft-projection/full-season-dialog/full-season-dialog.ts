import { Component, inject, output, signal } from '@angular/core';
import { HelpTipComponent } from '../../shared/help-tip/help-tip';
import { OpenPopovers } from '../../shared/popover/open-popovers';

export interface FullSeasonConfig {
  scaleStats: boolean;
  minGamesToScale: number;
  scaleGoalies: boolean;
}

/**
 * Confirmation shown before the one-click "full season" bulk action. It sets every skater's
 * games played to a full 84-game season and optionally rescales each player's stats — with a
 * minimum games-played threshold so a small sample isn't extrapolated up to a full season.
 *
 * Goalies are opted out by default and warned about when opted in: the ×84/82 they would take
 * assumes the line came from an 82-game season, which the AI projection did not, and a blanket
 * scaling breaks the one-net invariant its allocation holds.
 */
@Component({
  selector: 'app-full-season-dialog',
  imports: [HelpTipComponent],
  templateUrl: './full-season-dialog.html',
  styleUrl: './full-season-dialog.css',
})
export class FullSeasonDialogComponent {
  /** Opened from the GP column's menu, which would otherwise stay open behind this. */
  constructor() {
    inject(OpenPopovers).closeAll();
  }

  readonly confirm = output<FullSeasonConfig>();
  readonly cancelled = output<void>();

  readonly scaleStats = signal<boolean>(true);
  readonly minGamesToScale = signal<number>(20);
  readonly scaleGoalies = signal<boolean>(false);

  readonly scalingTooltip =
    'Counting stats such as goals and assists scale with games played. Rate stats such as ' +
    'SH%, SV% and GAA stay unchanged. Any games-played values you edited by hand will be overwritten.';

  toggleScaleStats(): void {
    this.scaleStats.update((enabled) => !enabled);
  }

  toggleScaleGoalies(): void {
    this.scaleGoalies.update((enabled) => !enabled);
  }

  onMinGamesInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.minGamesToScale.set(Math.max(0, Math.round(parsed)));
    }
  }

  onConfirm(): void {
    this.confirm.emit({
      scaleStats: this.scaleStats(),
      minGamesToScale: this.minGamesToScale(),
      scaleGoalies: this.scaleGoalies(),
    });
  }
}
