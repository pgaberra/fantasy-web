import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlayerProjectionsTableComponent } from '../../draft-projection/player-projections-table/player-projections-table';
import { StatInfoService } from '../../services/stat-info.service';
import { ActiveColumns, ScoringType } from '../../models/projection.model';
import { ScoringStatKey } from '../../models/stat-key.model';
import {
  createDefaultScaleSettings,
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_STAT_WEIGHTS,
  DEFAULT_UTILITY_COLUMNS,
} from '../../draft-projection/projection-defaults';
import { DEMO_PLAYERS } from '../demo-players';

// A tighter column set than the app default so the ranking payoff column stays
// visible on the landing page without horizontal scroll — still a real category mix
// (skater offense + peripherals + goalie wins/save %).
const DEMO_SCORING_COLUMNS: ScoringStatKey[] = ['goals', 'assists', 'hits', 'blocks', 'w', 'svPct'];

@Component({
  selector: 'app-landing-demo',
  imports: [RouterLink, PlayerProjectionsTableComponent],
  templateUrl: './landing-demo.html',
  styleUrl: './landing-demo.css',
})
export class LandingDemoComponent {
  private readonly statInfoService = inject(StatInfoService);

  readonly players = DEMO_PLAYERS;
  readonly scoringType = signal<ScoringType>('category');
  readonly statWeights = signal<Record<ScoringStatKey, number>>({ ...DEFAULT_STAT_WEIGHTS });
  readonly activeColumns: ActiveColumns = {
    scoring: new Set(DEMO_SCORING_COLUMNS),
    utility: new Set(DEFAULT_UTILITY_COLUMNS),
  };
  readonly scaleSettings = createDefaultScaleSettings((key) =>
    this.statInfoService.isRateStat(key),
  );
  readonly leagueSize = DEFAULT_LEAGUE_SIZE;
  readonly rosterSlots = DEFAULT_ROSTER_SLOTS;
  readonly minGoalieGames = DEFAULT_MIN_GOALIE_GAMES;

  setScoringType(type: ScoringType): void {
    this.scoringType.set(type);
  }
}
