import { Component, output } from '@angular/core';

/**
 * Confirmation shown before the one-click "full season" bulk action, which overwrites every
 * player's games played (skaters to 84, goalies scaled ×84/82) and rescales their stats.
 */
@Component({
  selector: 'app-full-season-dialog',
  templateUrl: './full-season-dialog.html',
  styleUrl: './full-season-dialog.css',
})
export class FullSeasonDialogComponent {
  readonly confirm = output<void>();
  readonly cancelled = output<void>();
}
