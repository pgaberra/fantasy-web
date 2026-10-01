import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { formatGames, RankedFreeAgent } from '../planner-free-agents';

/**
 * The best few available players as cards over the list: who, for which club, and the three
 * numbers a streamer picks by. Which players is the page's to say.
 */
@Component({
  selector: 'app-top-options',
  imports: [TeamLogoComponent],
  templateUrl: './top-options.html',
  styleUrl: './top-options.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopOptionsComponent {
  readonly rows = input.required<readonly RankedFreeAgent[]>();
  readonly scoringType = input.required<ScoringType>();

  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Proj. pts' : 'Z-Score',
  );

  score(row: RankedFreeAgent): string {
    return row.score.toFixed(this.decimals());
  }

  /** The score a game he plays, the way a streamer compares a three-game week to a four. */
  perGame(row: RankedFreeAgent): string {
    return row.games > 0 ? (row.score / row.games).toFixed(this.decimals()) : '';
  }

  games(row: RankedFreeAgent): string {
    return formatGames(row.games);
  }

  /** A claim rather than an add: the one status a streamer has to know before acting. */
  onWaivers(row: RankedFreeAgent): boolean {
    return row.player.availability === 'WAIVERS';
  }

  /** "EDM, C" under a card's name. */
  identity(row: RankedFreeAgent): string {
    const positions = row.player.positions.join(', ');
    return row.player.teamAbbrev ? `${row.player.teamAbbrev}, ${positions}` : positions;
  }

  private decimals(): number {
    return this.scoringType() === 'points' ? 1 : 2;
  }
}
