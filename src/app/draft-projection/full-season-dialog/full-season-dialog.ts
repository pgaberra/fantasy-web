import { Component, inject, output, signal } from '@angular/core';
import { HelpTipComponent } from '../../shared/help-tip/help-tip';
import { OpenPopovers } from '../../shared/popover/open-popovers';

export interface FullSeasonConfig {
  scaleStats: boolean;
  minGamesToScale: number;
}

/**
 * Confirmation shown before the one-click "full season" bulk action. It sets every player's
 * games played to a full 84-game season (skaters to 84, goalies scaled ×84/82) and optionally
 * rescales each player's stats — with a minimum games-played threshold so a small sample isn't
 * extrapolated up to a full season.
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

  readonly scalingTooltip =
    'Counting stats (goals, assists, …) scale with games played; rate stats like ' +
    "SH%, SV% and GAA are left unchanged. This overwrites any games-played values you've edited by hand.";

  toggleScaleStats(): void {
    this.scaleStats.update((enabled) => !enabled);
  }

  onMinGamesInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.minGamesToScale.set(Math.max(0, Math.round(parsed)));
    }
  }

  onConfirm(): void {
    this.confirm.emit({ scaleStats: this.scaleStats(), minGamesToScale: this.minGamesToScale() });
  }
}
