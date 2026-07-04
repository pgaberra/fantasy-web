import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlayerProjectionsTableComponent } from '../../draft-projection/player-projections-table/player-projections-table';
import { ProjectionSettingsSectionComponent } from '../../draft-projection/projection-settings-section/projection-settings-section';
import { StatInfoService } from '../../services/stat-info.service';
import { ActiveColumns, ScoringType } from '../../models/projection.model';
import { ScoringStatKey, SkaterUtilityStatKey } from '../../models/stat-key.model';
import { RosterSlots } from '../../api/models/roster-slots';
import {
  DecimalStatKey,
  DEFAULT_DECIMAL_SETTINGS,
  ScaleConfig,
} from '../../draft-projection/projection-settings-section/model';
import {
  createDefaultScaleSettings,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../../draft-projection/projection-defaults';
import { DEMO_PLAYERS } from '../demo-players';

@Component({
  selector: 'app-landing-demo',
  imports: [RouterLink, ProjectionSettingsSectionComponent, PlayerProjectionsTableComponent],
  templateUrl: './landing-demo.html',
  styleUrl: './landing-demo.css',
})
export class LandingDemoComponent {
  private readonly statInfoService = inject(StatInfoService);

  readonly players = DEMO_PLAYERS;

  // Same editable state as the signed-in editor (draft-projection), so the demo IS the
  // real editor — the only difference is that saving requires an account.
  readonly scoringType = signal<ScoringType>('category');
  readonly statWeights = signal<Record<ScoringStatKey, number>>({ ...DEFAULT_STAT_WEIGHTS });
  readonly activeScoringColumns = signal(new Set<ScoringStatKey>(DEFAULT_SCORING_COLUMNS));
  readonly activeUtilityColumns = signal(new Set<SkaterUtilityStatKey>(DEFAULT_UTILITY_COLUMNS));
  readonly activeColumns = computed<ActiveColumns>(() => ({
    scoring: this.activeScoringColumns(),
    utility: this.activeUtilityColumns(),
  }));
  readonly scaleSettings = signal<Record<SkaterUtilityStatKey, ScaleConfig>>(
    createDefaultScaleSettings((key) => this.statInfoService.isRateStat(key)),
  );
  readonly decimalSettings = signal<Record<DecimalStatKey, number>>(DEFAULT_DECIMAL_SETTINGS);
  readonly useDefaultDecimals = signal<boolean>(true);
  readonly leagueSize = signal<number>(DEFAULT_LEAGUE_SIZE);
  readonly rosterSlots = signal<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly minGoalieGames = signal<number>(DEFAULT_MIN_GOALIE_GAMES);
}
