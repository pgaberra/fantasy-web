import { inject, Injectable } from '@angular/core';
import { ActiveColumns, PositionFilter } from '../models/projection.model';
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
