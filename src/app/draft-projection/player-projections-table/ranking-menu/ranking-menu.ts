import { Component, input, model, output } from '@angular/core';
import {
  isHandRanked,
  ManualRanking,
  PROJECTED_RANKING,
  RankedPlayerType,
  RankingMode,
  withMode,
} from '../../../models/manual-ranking';

interface RankingRow {
  readonly type: RankedPlayerType;
  readonly label: string;
}

/**
 * Whether each half of the pool is ordered by its projections or by the owner.
 *
 * Split by player type because that is how the choice is actually made: the spreadsheets this
 * came from project skaters stat by stat and rank goalies by feel, and a manager who has an
 * opinion about the crease rarely has one about every fourth-liner.
 */
@Component({
  selector: 'app-ranking-menu',
  templateUrl: './ranking-menu.html',
  styleUrl: './ranking-menu.css',
})
export class RankingMenuComponent {
  readonly ranking = model<ManualRanking>(PROJECTED_RANKING);
  /** The type the table can be ordered in right now, if any: see the table's `rankableType`. */
  readonly rankableType = input<RankedPlayerType | null>(null);
  readonly rankRequested = output<RankedPlayerType>();

  protected readonly rows: readonly RankingRow[] = [
    { type: 'skater', label: 'Skaters' },
    { type: 'goalie', label: 'Goalies' },
  ];

  protected modeOf(type: RankedPlayerType): RankingMode {
    return this.ranking()[type].mode;
  }

  protected select(type: RankedPlayerType, mode: RankingMode): void {
    if (this.modeOf(type) === mode) {
      return;
    }
    this.ranking.set(withMode(this.ranking(), type, mode));
    if (mode === 'manual') {
      this.rankRequested.emit(type);
    }
  }

  /** Hand ranked, but not in a view where the places on screen are the ones being typed. */
  protected needsItsOwnView(type: RankedPlayerType): boolean {
    return isHandRanked(this.ranking(), type) && this.rankableType() !== type;
  }

  protected anyHandRanked(): boolean {
    return this.rows.some((row) => isHandRanked(this.ranking(), row.type));
  }
}
