import { inject, Injectable } from '@angular/core';
import { ActiveColumns, PositionFilter } from '../models/projection.model';
import { PositionFilterService } from './position-filter.service';
import { StatInfoService } from './stat-info.service';
import { ScoringStatKey, SkaterUtilityStatKey } from '../models/stat-key.model';

@Injectable({
  providedIn: 'root',
})
export class ActiveColumnsService {
  private readonly positionFilterService = inject(PositionFilterService);
  private readonly statInfoService = inject(StatInfoService);

  filterActiveColumns(activeColumns: ActiveColumns, filter: PositionFilter): ActiveColumns {
    const filterType = this.positionFilterService.getFilterType(filter);

    if (filterType === 'all') {
      return activeColumns;
    }

    const filteredScoring = new Set<ScoringStatKey>(
      [...activeColumns.scoring].filter(key => {
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
      [...activeColumns.utility].filter(key => {
        if (filterType === 'goalie') {
          return this.statInfoService.isGoalieUtilityStat(key);
        }
        if (filterType === 'skater') {
          return this.statInfoService.isSkaterUtilityStat(key);
        }
        return true;
      }),
    );

    return {
      scoring: filteredScoring,
      utility: filteredUtility,
    };
  }
}
