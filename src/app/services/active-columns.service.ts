import { inject, Injectable } from '@angular/core';
import { ActiveColumns, PositionFilter, SortColumn } from '../models/projection.model';
import { PositionFilterService } from './position-filter.service';
import { StatInfoService } from './stat-info.service';
import {
  ScoringStatKey,
  SCORING_STAT_KEYS,
  SkaterUtilityStatKey,
  UTILITY_STAT_KEYS,
} from '../models/stat-key.model';

@Injectable({
  providedIn: 'root',
})
export class ActiveColumnsService {
  private readonly positionFilterService = inject(PositionFilterService);
  private readonly statInfoService = inject(StatInfoService);

  filterAndSortActiveColumns(activeColumns: ActiveColumns, filter: PositionFilter): ActiveColumns {
    const filterType = this.positionFilterService.getFilterType(filter);

    if (filterType === 'all') {
      return this.sortActiveColumns(activeColumns);
    }

    const filteredScoring = new Set<ScoringStatKey>(
      [...activeColumns.scoring].filter((key) => {
        if (filterType === 'goalie') {
          return this.statInfoService.isGoalieScoringStat(key);
        }
        if (filterType === 'skater') {
          return this.statInfoService.isSkaterScoringStat(key);
        }
        return true;
      }),
    );

    const filteredUtility = new Set<SkaterUtilityStatKey>(
      [...activeColumns.utility].filter((key) => {
        if (filterType === 'goalie') {
          return this.statInfoService.isGoalieUtilityStat(key);
        }
        if (filterType === 'skater') {
          return this.statInfoService.isSkaterUtilityStat(key);
        }
        return true;
      }),
    );

    return this.sortActiveColumns({
      scoring: filteredScoring,
      utility: filteredUtility,
    });
  }

  /**
   * The filter the columns are chosen by, which is the position filter until players are picked by
   * name. Picking only skaters leaves the goalie columns a run of dashes, and picking only goalies
   * does the same to the skater ones, so a pick of one kind narrows the columns as the position
   * filter would have. A pick of both kinds needs both, and a position filter that is already
   * narrowing is left to decide.
   */
  columnFilter(
    filter: PositionFilter,
    pickedIds: readonly number[],
    players: readonly { readonly id: number; readonly type: 'skater' | 'goalie' }[],
  ): PositionFilter {
    if (filter !== 'ALL' || pickedIds.length === 0) {
      return filter;
    }
    const picked = new Set(pickedIds);
    const types = new Set(
      players.filter((player) => picked.has(player.id)).map((player) => player.type),
    );
    if (types.size !== 1) {
      return 'ALL';
    }
    return types.has('goalie') ? 'G' : 'SKATER';
  }

  /**
   * Whether a table narrowed to `filter` still shows the column it is sorted by. The name and the
   * ranking are always on screen; a stat column is only there while the filter keeps it, and a
   * table left sorted by a column it no longer shows sits in an order nothing on screen explains.
   */
  showsSortColumn(
    column: SortColumn,
    activeColumns: ActiveColumns,
    filter: PositionFilter,
  ): boolean {
    if (column === 'name' || column === 'summary') {
      return true;
    }
    const shown = this.filterAndSortActiveColumns(activeColumns, filter);
    return (
      (shown.scoring as ReadonlySet<string>).has(column) ||
      (shown.utility as ReadonlySet<string>).has(column)
    );
  }

  private sortActiveColumns(activeColumns: ActiveColumns): ActiveColumns {
    const sortedUtility = new Set<SkaterUtilityStatKey>(
      [...activeColumns.utility].sort(
        (a, b) => UTILITY_STAT_KEYS.indexOf(a) - UTILITY_STAT_KEYS.indexOf(b),
      ),
    );
    const sortedScoring = new Set<ScoringStatKey>(
      [...activeColumns.scoring].sort(
        (a, b) => SCORING_STAT_KEYS.indexOf(a) - SCORING_STAT_KEYS.indexOf(b),
      ),
    );
    return { utility: sortedUtility, scoring: sortedScoring };
  }
}
