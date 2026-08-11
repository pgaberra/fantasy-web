import { Component, input, model, output } from '@angular/core';
import { RosterSlotsEditorComponent } from '../../../shared/roster-slots-editor/roster-slots-editor';
import { RosterSlots } from '../../../api/models/roster-slots';
import { ScoringType } from '../../../models/projection.model';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  FULL_SEASON_GAMES,
} from '../../projection-defaults';

/**
 * Facts about the league itself: how big it is, what it rosters, and where those answers were
 * imported from. Nothing here is about the table — how a column is formatted belongs to the
 * columns menu. League size and roster slots only feed the category z-scores, which is why
 * they hide in a points league.
 */
@Component({
  selector: 'app-league-settings-menu',
  templateUrl: './league-settings-menu.html',
  styleUrl: './league-settings-menu.css',
  imports: [RosterSlotsEditorComponent],
})
export class LeagueSettingsMenuComponent {
  readonly scoringType = input.required<ScoringType>();
  /** Set once a league has been imported — these settings then have a provenance worth stating. */
  readonly syncedLeagueName = input<string | null>(null);
  readonly manageSync = output<void>();

  readonly leagueSize = model<number>(DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = model<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = model<number>(DEFAULT_MIN_GOALIE_GAMES);

  onLeagueSizeInput(event: Event): void {
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
