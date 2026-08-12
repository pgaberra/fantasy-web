import { Component, computed, input, model, output } from '@angular/core';
import { RosterSlotsEditorComponent } from '../../../shared/roster-slots-editor/roster-slots-editor';
import { RosterSlots } from '../../../api/models/roster-slots';
import { ScoringType } from '../../../models/projection.model';
import { SCORING_STAT_KEYS, ScoringStatKey } from '../../../models/stat-key.model';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  FULL_SEASON_GAMES,
} from '../../projection-defaults';

/**
 * Facts about the league itself: what it scores, how big it is, what it rosters, and where those
 * answers were imported from. Nothing here is about the table — how a column is formatted belongs
 * to the columns menu.
 *
 * Which half applies depends on the scoring type, and every league has one: the stat weights *are*
 * a points league's setup, while league size and roster slots only feed the category z-scores. The
 * menu used to hold nothing at all for a points league and said so in a note, which left the button
 * opening onto a dead end for every projection that had not been switched to category.
 */
@Component({
  selector: 'app-league-settings-menu',
  templateUrl: './league-settings-menu.html',
  styleUrl: './league-settings-menu.css',
  imports: [RosterSlotsEditorComponent, StatLabelPipe],
})
export class LeagueSettingsMenuComponent {
  readonly scoringType = input.required<ScoringType>();
  /** Set once a league has been imported — these settings then have a provenance worth stating. */
  readonly syncedLeagueName = input<string | null>(null);
  readonly manageSync = output<void>();

  readonly leagueSize = model<number>(DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = model<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = model<number>(DEFAULT_MIN_GOALIE_GAMES);

  readonly statWeights = model<Record<ScoringStatKey, number>>(
    {} as Record<ScoringStatKey, number>,
  );
  /**
   * Unfiltered by the table's position filter: what the league scores does not change because the
   * user is currently looking only at goalies.
   */
  readonly activeScoringColumns = input<Set<ScoringStatKey>>(new Set<ScoringStatKey>());

  /** Column order, so the list reads the same way round as the table it belongs to. */
  readonly weightedStats = computed(() =>
    SCORING_STAT_KEYS.filter((statKey) => this.activeScoringColumns().has(statKey)),
  );

  weightFor(statKey: ScoringStatKey): number {
    return this.statWeights()[statKey] ?? 0;
  }

  onWeightInput(statKey: ScoringStatKey, event: Event): void {
    const weight = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(weight)) {
      this.statWeights.update((weights) => ({ ...weights, [statKey]: weight }));
    }
  }

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
