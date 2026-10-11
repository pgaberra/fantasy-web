import { Component, computed, input, model, output } from '@angular/core';
import { HelpTipComponent } from '../../../shared/help-tip/help-tip';
import { RosterSlotsEditorComponent } from '../../../shared/roster-slots-editor/roster-slots-editor';
import { RosterSlots } from '../../../api/models/roster-slots';
import { ScoringType } from '../../../models/projection.model';
import { IconComponent } from '../../../shared/icon/icon';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  FULL_SEASON_GAMES,
} from '../../projection-defaults';

/**
 * Facts about the league itself: how big it is, what it rosters, and where those answers were
 * imported from. Nothing here is about the table — how a column is formatted belongs to the
 * columns menu.
 *
 * A points league's scoring is not here either. The weights sit in the table header, in a row of
 * inputs standing under the columns they weight, which is a better place to set eight of them than
 * any list in a popover. That leaves this menu with nothing to say about a points league, so the
 * button that opens it is hidden there rather than opening onto an explanation.
 *
 * An imported league owns its size and roster: both are shown as it set them and cannot be
 * changed until the league is disconnected. The goalie minimum is not the league's and stays.
 */
@Component({
  selector: 'app-league-settings-menu',
  templateUrl: './league-settings-menu.html',
  styleUrl: './league-settings-menu.css',
  imports: [HelpTipComponent, RosterSlotsEditorComponent, IconComponent],
})
export class LeagueSettingsMenuComponent {
  readonly scoringType = input.required<ScoringType>();
  /** Set once a league has been imported — these settings then have a provenance worth stating. */
  readonly syncedLeagueName = input<string | null>(null);
  readonly manageSync = output<void>();
  readonly locked = computed(() => this.syncedLeagueName() !== null);
  /**
   * Whether the menu sets the league's size and roster. Off in the draft setup, which asks for
   * both itself — the size as the teams it seats — and must not ask twice.
   */
  readonly sizing = input<boolean>(true);

  readonly leagueSize = model<number>(DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = model<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = model<number>(DEFAULT_MIN_GOALIE_GAMES);

  onLeagueSizeInput(event: Event): void {
    if (this.locked()) {
      return;
    }
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.leagueSize.set(Math.min(30, Math.max(2, Math.round(parsed))));
    }
  }

  onMinGoalieGamesInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.minGoalieGames.set(Math.min(FULL_SEASON_GAMES, Math.max(0, Math.round(parsed))));
    }
  }

  protected readonly FULL_SEASON_GAMES = FULL_SEASON_GAMES;
}
