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
