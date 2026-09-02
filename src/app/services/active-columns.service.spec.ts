import { MockBuilder, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveColumnsService } from './active-columns.service';
import { PositionFilterService } from './position-filter.service';
import { StatInfoService } from './stat-info.service';
import { ActiveColumns } from '../models/projection.model';

describe('ActiveColumnsService', () => {
  beforeEach(() =>
    MockBuilder(ActiveColumnsService).mock(PositionFilterService).mock(StatInfoService),
  );

  it('should be created', () => {
    const service = ngMocks.findInstance(ActiveColumnsService);
    expect(service).toBeTruthy();
  });

  it('should return all columns when filter type is all', () => {
    const service = ngMocks.findInstance(ActiveColumnsService);
    const positionFilterService = ngMocks.findInstance(PositionFilterService);

    const activeColumns: ActiveColumns = {
      scoring: new Set(['goals', 'w']),
      utility: new Set(['gp', 'toiPerGame']),
    };
    vi.spyOn(positionFilterService, 'getFilterType').mockReturnValue('all');

    const result = service.filterAndSortActiveColumns(activeColumns, 'ALL');

    expect(result).toEqual(activeColumns);
  });

  it('should filter columns for goalie', () => {
    const service = ngMocks.findInstance(ActiveColumnsService);
    const positionFilterService = ngMocks.findInstance(PositionFilterService);
    const statInfoService = ngMocks.findInstance(StatInfoService);

    const activeColumns: ActiveColumns = {
      scoring: new Set(['goals', 'w']),
      utility: new Set(['gp', 'toiPerGame']),
    };
    vi.spyOn(positionFilterService, 'getFilterType').mockReturnValue('goalie');
    vi.spyOn(statInfoService, 'isGoalieScoringStat').mockImplementation((key) => key === 'w');
    vi.spyOn(statInfoService, 'isGoalieUtilityStat').mockImplementation((key) => key === 'gp');

    const result = service.filterAndSortActiveColumns(activeColumns, 'G');

    expect(result.scoring.has('w')).toEqual(true);
    expect(result.scoring.has('goals')).toEqual(false);
    expect(result.utility.has('gp')).toEqual(true);
    expect(result.utility.has('toiPerGame')).toEqual(false);
  });

  it('should filter columns for skater', () => {
    const service = ngMocks.findInstance(ActiveColumnsService);
    const positionFilterService = ngMocks.findInstance(PositionFilterService);
    const statInfoService = ngMocks.findInstance(StatInfoService);

    const activeColumns: ActiveColumns = {
      scoring: new Set(['goals', 'w']),
      utility: new Set(['gp', 'toiPerGame']),
    };
    vi.spyOn(positionFilterService, 'getFilterType').mockReturnValue('skater');
    vi.spyOn(statInfoService, 'isSkaterScoringStat').mockImplementation((key) => key === 'goals');
    vi.spyOn(statInfoService, 'isSkaterUtilityStat').mockImplementation(
      (key) => key === 'gp' || key === 'toiPerGame',
    );

    const result = service.filterAndSortActiveColumns(activeColumns, 'SKATER');

    expect(result.scoring.has('goals')).toEqual(true);
    expect(result.scoring.has('w')).toEqual(false);
    expect(result.utility.has('gp')).toEqual(true);
    expect(result.utility.has('toiPerGame')).toEqual(true);
  });

  it('should sort utility columns by UTILITY_STAT_KEYS order', () => {
    const service = ngMocks.findInstance(ActiveColumnsService);
    const positionFilterService = ngMocks.findInstance(PositionFilterService);

    const activeColumns: ActiveColumns = {
      scoring: new Set(),
      utility: new Set(['toiPerGame', 'gp']),
    };
    vi.spyOn(positionFilterService, 'getFilterType').mockReturnValue('all');

    const result = service.filterAndSortActiveColumns(activeColumns, 'ALL');

    expect([...result.utility]).toEqual(['gp', 'toiPerGame']);
  });

  describe('showsSortColumn', () => {
    const columns: ActiveColumns = {
      scoring: new Set(['goals', 'w']),
      utility: new Set(['gp', 'toiPerGame']),
    };

    /** The two columns every table shows, whoever is on screen. */
    it('always shows the name and the ranking', () => {
      const service = ngMocks.findInstance(ActiveColumnsService);
      const positionFilterService = ngMocks.findInstance(PositionFilterService);
      vi.spyOn(positionFilterService, 'getFilterType').mockReturnValue('skater');

      expect(service.showsSortColumn('name', columns, 'LW')).toEqual(true);
      expect(service.showsSortColumn('summary', columns, 'LW')).toEqual(true);
    });

    it('says a stat column the filter keeps is still on screen', () => {
      const service = ngMocks.findInstance(ActiveColumnsService);
      const positionFilterService = ngMocks.findInstance(PositionFilterService);
      const statInfoService = ngMocks.findInstance(StatInfoService);
      vi.spyOn(positionFilterService, 'getFilterType').mockReturnValue('skater');
      vi.spyOn(statInfoService, 'isSkaterScoringStat').mockImplementation((key) => key === 'goals');
      vi.spyOn(statInfoService, 'isSkaterUtilityStat').mockReturnValue(true);

      expect(service.showsSortColumn('goals', columns, 'LW')).toEqual(true);
      expect(service.showsSortColumn('gp', columns, 'LW')).toEqual(true);
    });

    it('says a stat column the filter drops is gone', () => {
      const service = ngMocks.findInstance(ActiveColumnsService);
      const positionFilterService = ngMocks.findInstance(PositionFilterService);
      const statInfoService = ngMocks.findInstance(StatInfoService);
      vi.spyOn(positionFilterService, 'getFilterType').mockReturnValue('skater');
      vi.spyOn(statInfoService, 'isSkaterScoringStat').mockImplementation((key) => key === 'goals');
      vi.spyOn(statInfoService, 'isSkaterUtilityStat').mockReturnValue(true);

      expect(service.showsSortColumn('w', columns, 'LW')).toEqual(false);
    });
  });

  it('should sort scoring columns with skater stats before goalie stats', () => {
    const service = ngMocks.findInstance(ActiveColumnsService);
    const positionFilterService = ngMocks.findInstance(PositionFilterService);

    const activeColumns: ActiveColumns = {
      scoring: new Set(['w', 'assists', 'goals']),
      utility: new Set(),
    };
    vi.spyOn(positionFilterService, 'getFilterType').mockReturnValue('all');

    const result = service.filterAndSortActiveColumns(activeColumns, 'ALL');

    expect([...result.scoring]).toEqual(['goals', 'assists', 'w']);
  });
});
