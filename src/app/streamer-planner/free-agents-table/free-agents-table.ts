import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { formatGames, formatToi, RankedFreeAgent } from '../planner-free-agents';

/**
 * The best available players as one list, best first, with the model's line for the nights counted
 * scored by the league's own settings. Which positions and how many rows is the page's to say.
 */
@Component({
  selector: 'app-free-agents-table',
  imports: [PositionChipsComponent, TeamLogoComponent, TooltipDirective],
  templateUrl: './free-agents-table.html',
  styleUrl: './free-agents-table.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeAgentsTableComponent {
  readonly rows = input.required<readonly RankedFreeAgent[]>();
  readonly scoringType = input.required<ScoringType>();

  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Proj. pts' : 'Z-Score',
  );

  score(row: RankedFreeAgent): string {
    return row.score.toFixed(this.scoringType() === 'points' ? 1 : 2);
  }

  /** The score per game he plays, the way a streamer compares a three-game week to a four. */
  perGame(row: RankedFreeAgent): string {
    if (row.games <= 0) {
      return '';
    }
    return `${(row.score / row.games).toFixed(this.scoringType() === 'points' ? 1 : 2)}/gm`;
  }

  games(row: RankedFreeAgent): string {
    return formatGames(row.games);
  }

  /** Ice time a game, for a skater; a goalie's is the whole game or none of it. */
  toi(row: RankedFreeAgent): string {
    if (row.player.projection.type !== 'skater') {
      return '';
    }
    return formatToi(row.player.projection.stats.utility.toiPerGame);
  }

  /** A claim rather than an add: the one status a streamer has to know before acting. */
  onWaivers(row: RankedFreeAgent): boolean {
    return row.player.availability === 'WAIVERS';
  }

  /**
   * The projected line in the stats every league reads first, so a row says what the score is
   * made of: goals, assists and shots for a skater; wins, saves and save percentage for a goalie.
   */
  line(row: RankedFreeAgent): readonly string[] {
    const projection = row.player.projection;
    if (projection.type === 'goalie') {
      const { w, sv, svPct } = projection.stats.scoring;
      return [`${w.toFixed(1)} W`, `${sv.toFixed(0)} SV`, `${svPct.toFixed(3)} SV%`];
    }
    const { goals, assists, sog } = projection.stats.scoring;
    return [`${goals.toFixed(1)} G`, `${assists.toFixed(1)} A`, `${sog.toFixed(1)} SOG`];
  }
}
