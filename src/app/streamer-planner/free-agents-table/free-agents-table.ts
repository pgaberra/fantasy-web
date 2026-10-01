import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ScoringType } from '../../models/projection.model';
import { ScoringStatKey } from '../../models/stat-key.model';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import {
  formatGames,
  formatToi,
  FreeAgentGroup,
  lineGrid,
  lineStats,
  LineStat,
  PlannerPositionGroup,
  RankedFreeAgent,
} from '../planner-free-agents';

/** The grid a line is drawn on at each width of the table, as CSS grid tracks. */
export interface LineGrids {
  readonly wide: string;
  readonly mid: string;
  readonly narrow: string;
}

/** A player with his line in the league's categories, ready to draw. */
export interface FreeAgentRow {
  readonly row: RankedFreeAgent;
  readonly stats: readonly LineStat[];
  /** The grid every player of his kind shares, skaters one and goalies another. */
  readonly grid: LineGrids;
}

export interface FreeAgentBand {
  readonly position: PlannerPositionGroup;
  readonly rows: readonly FreeAgentRow[];
}

/**
 * The most stats a line holds in a wide table, a middling one and a phone's. The widths these
 * stand for are the container queries in the stylesheet; a line of more breaks into even lines.
 */
const MOST_PER_LINE = { wide: 8, mid: 5, narrow: 4 } as const;

/**
 * The best available players by position, the few of each worth a look, with the model's line for
 * the nights counted, in every category the league scores, and scored by the league's own settings.
 */
@Component({
  selector: 'app-free-agents-table',
  imports: [PositionChipsComponent, TeamLogoComponent, TooltipDirective],
  templateUrl: './free-agents-table.html',
  styleUrl: './free-agents-table.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreeAgentsTableComponent {
  readonly groups = input.required<readonly FreeAgentGroup[]>();
  readonly scoringType = input.required<ScoringType>();
  /** The categories the league scores, in the league's order. */
  readonly categories = input.required<readonly ScoringStatKey[]>();

  /**
   * Each position with its players' lines. Every skater's line is drawn on one grid and every
   * goalie's on another, so a category sits in the same place from one player to the next, down
   * the whole list and across its positions, and reads as a column.
   */
  readonly bands = computed<readonly FreeAgentBand[]>(() => {
    const categories = this.categories();
    const lines = this.groups().map((group) =>
      group.rows.map((row) => ({ row, stats: lineStats(row, categories) })),
    );
    const gridFor = (type: RankedFreeAgent['line']['type']): LineGrids => {
      const ofType = lines
        .flat()
        .filter((entry) => entry.row.line.type === type)
        .map((entry) => entry.stats);
      return {
        wide: lineGrid(ofType, MOST_PER_LINE.wide),
        mid: lineGrid(ofType, MOST_PER_LINE.mid),
        narrow: lineGrid(ofType, MOST_PER_LINE.narrow),
      };
    };
    const grids = { skater: gridFor('skater'), goalie: gridFor('goalie') };
    return this.groups().map((group, index) => ({
      position: group.position,
      rows: lines[index].map((entry) => ({ ...entry, grid: grids[entry.row.line.type] })),
    }));
  });

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
}
