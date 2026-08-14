import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectionsTableHeaderComponent } from './projections-table-header';
import { ScoringStatKey, SkaterUtilityStatKey } from '../../../models/stat-key.model';
import { DEFAULT_DECIMAL_SETTINGS, DecimalStatKey } from '../../projection-settings-section/model';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';
import { StatTooltipPipe } from '../../../pipes/stat-tooltip.pipe';
import { PopoverTriggerDirective } from '../../../shared/popover/popover-trigger.directive';

describe('ProjectionsTableHeaderComponent', () => {
  const mockStatWeights: Record<ScoringStatKey, number> = {
    stpg: 0,
    stpa: 0,
    stp: 0,
    hatTricks: 0,
    defPoints: 0,
    shifts: 0,
    toi: 0,
    otl: 0,
    winPct: 0,
    goals: 4.5,
    assists: 3,
    points: 0,
    sog: 0.5,
    hits: 0.33,
    blocks: 0.5,
    gwg: 0.5,
    pim: 0.5,
    ppg: 0.5,
    ppa: 0.5,
    ppp: 0,
    shg: 0.5,
    sha: 0.5,
    shp: 0,
    shPct: 0.5,
    fw: 0.5,
    fl: 0.5,
    plusMinus: 0.5,
    gs: 0,
    w: 0,
    l: 0,
    sho: 0,
    sa: 0,
    sv: 0,
    ga: 0,
    gaa: 0,
    svPct: 0,
  };

  const headerTemplate = `
    <table>
      <thead app-projections-table-header
        [activeColumns]="activeColumns"
        [scoringType]="scoringType"
        [(statWeights)]="statWeights"
        [useDefaultDecimals]="useDefaultDecimals"
        [(decimalSettings)]="decimalSettings"
        [sortColumn]="sortColumn"
        [sortDirection]="sortDirection"
        [showFullSeasonButton]="showFullSeasonButton"
        [columnControls]="columnControls"
        [allActiveScoringColumns]="allActiveScoringColumns"
        [scaleSettings]="scaleSettings"
        [readonly]="readonly"
      ></thead>
    </table>
  `;

  beforeEach(() =>
    MockBuilder(ProjectionsTableHeaderComponent)
      .keep(StatLabelPipe)
      .keep(StatTooltipPipe)
      .keep(PopoverTriggerDirective),
  );

  const overlayText = () => {
    TestBed.inject(ApplicationRef).tick();
    return document.querySelector('.cdk-overlay-container')?.textContent ?? '';
  };

  const getFixture = (overrides: object = {}) =>
    MockRender(headerTemplate, {
      activeColumns: {
        scoring: new Set<ScoringStatKey>(['goals', 'assists']),
        utility: new Set<SkaterUtilityStatKey>(['gp']),
      },
      scoringType: 'category',
      statWeights: mockStatWeights,
      useDefaultDecimals: true,
      decimalSettings: DEFAULT_DECIMAL_SETTINGS,
      maxDecimalSetting: 3,
      sortColumn: 'summary',
      sortDirection: 'desc',
      showFullSeasonButton: false,
      columnControls: false,
      allActiveScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      scaleSettings: null,
      readonly: false,
      ...overrides,
    });

  const getComponent = (overrides: object = {}) =>
    ngMocks.find(getFixture(overrides).debugElement, ProjectionsTableHeaderComponent)
      .componentInstance;

  describe('summaryLabel', () => {
    it('should return "Total Points" when scoringType is "points"', () => {
      expect(getComponent({ scoringType: 'points' }).summaryLabel()).toEqual('Total Points');
    });

    it('should return "Z-Score" when scoringType is "category"', () => {
      expect(getComponent({ scoringType: 'category' }).summaryLabel()).toEqual('Z-Score');
    });
  });

  describe('sortIndicator', () => {
    it('shows a down arrow for the descending sorted column', () => {
      expect(
        getComponent({ sortColumn: 'goals', sortDirection: 'desc' }).sortIndicator('goals'),
      ).toEqual('▼');
    });

    it('shows an up arrow for the ascending sorted column', () => {
      expect(
        getComponent({ sortColumn: 'goals', sortDirection: 'asc' }).sortIndicator('goals'),
      ).toEqual('▲');
    });

    it('shows nothing for a column that is not the sorted one', () => {
      expect(
        getComponent({ sortColumn: 'goals', sortDirection: 'desc' }).sortIndicator('assists'),
      ).toEqual('');
    });
  });

  describe('gpDecimalSetting', () => {
    it('should return the gp value from decimalSettings', () => {
      expect(getComponent().gpDecimalSetting()).toEqual(DEFAULT_DECIMAL_SETTINGS.gp);
    });
  });

  describe('onDecimalInput', () => {
    it('should update decimalSettings when a decimal input changes', () => {
      const component = getComponent({
        decimalSettings: { gp: 0, goals: 0 } as Record<DecimalStatKey, number>,
      });
      const event = { target: { value: '2' } } as unknown as Event;
      component.onDecimalInput('gp', event);
      expect(component.decimalSettings().gp).toEqual(2);
    });

    it('should cap the decimal value to MAX_DECIMAL_SETTING', () => {
      const component = getComponent({
        decimalSettings: { gp: 0 } as Record<DecimalStatKey, number>,
      });
      const event = { target: { value: '5' } } as unknown as Event;
      component.onDecimalInput('gp', event);
      expect(component.decimalSettings().gp).toEqual(3);
    });
  });

  describe('template', () => {
    it('should render "#" and "Player" as fixed column headers', () => {
      getFixture();
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('#');
      expect(headers).toContain('Player');
    });

    it('should render a header for each active utility column', () => {
      getFixture({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        },
      });
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('GP');
    });

    it('should render a header for each active scoring column', () => {
      getFixture({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        },
      });
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers).toContain('Goals');
      expect(headers).toContain('Assists');
    });

    it('should show "Z-Score" in the summary column when scoringType is "category"', () => {
      getFixture({ scoringType: 'category' });
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers.some((h) => h.includes('Z-Score'))).toEqual(true);
    });

    it('should show "Total Points" in the summary column when scoringType is "points"', () => {
      getFixture({ scoringType: 'points' });
      const headers = ngMocks.findAll('th').map((th) => th.nativeElement.textContent.trim());
      expect(headers.some((h) => h.includes('Total Points'))).toEqual(true);
    });

    it('should emit the column key when a sortable header is clicked', () => {
      const fixture = getFixture({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals']),
          utility: new Set<SkaterUtilityStatKey>(),
        },
      });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const emit = vi.spyOn(component.sort, 'emit');
      const goalsSort = ngMocks
        .findAll('.th-sort')
        .find((button) => button.nativeElement.textContent.includes('Goals'))!;
      goalsSort.nativeElement.dispatchEvent(new Event('click'));
      expect(emit).toHaveBeenCalledWith('goals');
    });

    it('should render the weight-row when scoringType is "points"', () => {
      getFixture({ scoringType: 'points' });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(1);
    });

    it('should not render the weight-row when scoringType is "category"', () => {
      getFixture({ scoringType: 'category' });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(0);
    });

    it('keeps the weight-row on the surfaces with column menus too', () => {
      // The inputs stand under the columns they weight, which beats any list in a popover for
      // setting eight of them, so the toolbar does not take them over.
      getFixture({ scoringType: 'points', columnControls: true });
      expect(ngMocks.findAll('.weight-row')).toHaveLength(1);
    });

    it('should populate weight inputs with the current stat weights', () => {
      getFixture({
        scoringType: 'points',
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        },
      });
      const input = ngMocks.find('.weight-row input').nativeElement as HTMLInputElement;
      expect(input.value).toEqual('4.5');
    });

    it('should update statWeights when a weight input changes', () => {
      const fixture = getFixture({
        scoringType: 'points',
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        },
      });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const input = ngMocks.find('.weight-row input').nativeElement as HTMLInputElement;
      input.value = '5.5';
      input.dispatchEvent(new Event('input'));
      expect(component.statWeights().goals).toEqual(5.5);
    });

    it('should not render the decimal-row by default', () => {
      getFixture();
      expect(ngMocks.findAll('.decimal-row')).toHaveLength(0);
    });

    it('should render the decimal-row when useDefaultDecimals is false', () => {
      getFixture({ useDefaultDecimals: false });
      expect(ngMocks.findAll('.decimal-row')).toHaveLength(1);
    });

    it('should render one decimal input per active scoring column in the decimal-row', () => {
      getFixture({
        useDefaultDecimals: false,
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(),
        },
      });
      expect(ngMocks.findAll('.decimal-row input')).toHaveLength(2);
    });

    it('should update decimalSettings when a scoring decimal input changes', () => {
      const fixture = getFixture({
        useDefaultDecimals: false,
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals']),
          utility: new Set<SkaterUtilityStatKey>(),
        },
      });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const input = ngMocks.find('.decimal-row input').nativeElement as HTMLInputElement;
      input.value = '2';
      input.dispatchEvent(new Event('input'));
      expect(component.decimalSettings().goals).toEqual(2);
    });

    it('should render a decimal input for the gp utility column in the decimal-row', () => {
      getFixture({
        useDefaultDecimals: false,
        activeColumns: {
          scoring: new Set<ScoringStatKey>(),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        },
      });
      expect(ngMocks.findAll('.decimal-row input')).toHaveLength(1);
    });

    it('should update decimalSettings when the gp decimal input changes', () => {
      const fixture = getFixture({
        useDefaultDecimals: false,
        activeColumns: {
          scoring: new Set<ScoringStatKey>(),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        },
      });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const input = ngMocks.find('.decimal-row input').nativeElement as HTMLInputElement;
      input.value = '1';
      input.dispatchEvent(new Event('input'));
      expect(component.decimalSettings().gp).toEqual(1);
    });
  });

  describe('utility / scoring split', () => {
    it('says what a utility column is for, which its label cannot', () => {
      expect(getComponent().utilityTooltip('gp')).toEqual(
        'Games Played — a Utility Stat that can be used to scale and project other stats.',
      );
    });

    it('keeps expanding the abbreviation, which is the only place TOI/G is spelled out', () => {
      expect(getComponent().utilityTooltip('toiPerGame')).toEqual(
        'Time on Ice per Game — a Utility Stat that can be used to scale and project other stats.',
      );
    });

    it('opens the scoring block at the first scoring column of every header row', () => {
      getFixture({
        scoringType: 'points',
        useDefaultDecimals: false,
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(['gp', 'toiPerGame']),
        },
      });
      // The label row, the weight row and the decimal row — the rule runs the full thead height.
      expect(ngMocks.findAll('.group-start')).toHaveLength(3);
    });

    it('marks only the first scoring column, not every one', () => {
      getFixture({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists', 'sog']),
          utility: new Set<SkaterUtilityStatKey>(['gp']),
        },
      });
      const divided = ngMocks.findAll('.group-start');
      expect(divided).toHaveLength(1);
      expect(divided[0].nativeElement.textContent).toContain('Goals');
    });

    it('draws no rule when there are no utility columns to divide off', () => {
      getFixture({
        activeColumns: {
          scoring: new Set<ScoringStatKey>(['goals', 'assists']),
          utility: new Set<SkaterUtilityStatKey>(),
        },
      });
      expect(ngMocks.findAll('.group-start')).toHaveLength(0);
    });
  });

  describe('full-season pill', () => {
    it('does not render the pill by default', () => {
      getFixture();
      expect(ngMocks.findAll('.full-season-pill')).toHaveLength(0);
    });

    it('renders the pill in the GP header when showFullSeasonButton is true', () => {
      getFixture({ showFullSeasonButton: true });
      const pills = ngMocks.findAll('.full-season-pill');
      expect(pills).toHaveLength(1);
      expect(pills[0].nativeElement.textContent.trim()).toContain('84');
    });

    it('emits fullSeason without sorting when the pill is clicked', () => {
      const fixture = getFixture({ showFullSeasonButton: true });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const fullSeasonEmit = vi.spyOn(component.fullSeason, 'emit');
      const sortEmit = vi.spyOn(component.sort, 'emit');
      ngMocks
        .find('.full-season-pill')
        .nativeElement.dispatchEvent(new Event('click', { bubbles: true }));
      expect(fullSeasonEmit).toHaveBeenCalled();
      expect(sortEmit).not.toHaveBeenCalled();
    });
  });

  describe('column controls', () => {
    const scaleSettings = {
      gp: { scale: true, scalableStats: new Set<ScoringStatKey>(['goals']) },
      toiPerGame: { scale: false, scalableStats: new Set<ScoringStatKey>() },
    };

    it('renders no menu triggers while column controls are off', () => {
      getFixture();
      expect(ngMocks.findAll('.th-menu')).toHaveLength(0);
    });

    it('renders a menu trigger per stat column and spends no column on adding one', () => {
      getFixture({ columnControls: true });
      // Two scoring columns and one utility column.
      expect(ngMocks.findAll('.th-menu')).toHaveLength(3);
      // Picking stats lives in the toolbar: a header cell for it is only reachable after
      // scrolling the table fully right.
      expect(ngMocks.findAll('.col-add')).toHaveLength(0);
    });

    it('keeps the standalone decimal row for surfaces without column menus', () => {
      getFixture({ useDefaultDecimals: false });
      expect(ngMocks.findAll('.decimal-row')).toHaveLength(1);
    });

    it('drops the decimal row once decimals live in the column menus', () => {
      getFixture({ useDefaultDecimals: false, columnControls: true });
      expect(ngMocks.findAll('.decimal-row')).toHaveLength(0);
    });

    it('routes a removal to the output matching the column kind', () => {
      const component = getComponent({ columnControls: true });
      const scoringEmit = vi.spyOn(component.scoringColumnToggled, 'emit');
      const utilityEmit = vi.spyOn(component.utilityColumnToggled, 'emit');

      component.removeColumn('goals');
      expect(scoringEmit).toHaveBeenCalledWith('goals');

      component.removeColumn('gp');
      expect(utilityEmit).toHaveBeenCalledWith('gp');
    });

    it('offers only non-rate skater stats to a skater-only utility column', () => {
      const component = getComponent({
        columnControls: true,
        scaleSettings,
        allActiveScoringColumns: new Set<ScoringStatKey>(['goals', 'shPct', 'sv']),
      });

      expect(component.scalableStatsFor('toiPerGame')).toEqual(['goals']);
    });

    it('summarises how many of the scalable stats are selected', () => {
      const component = getComponent({
        columnControls: true,
        scaleSettings,
        allActiveScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      });

      expect(component.scaledStatSummary('gp')).toEqual('1 of 2');
    });

    it('opens the column menu in an overlay and removes the column from it', () => {
      const fixture = getFixture({ columnControls: true, scaleSettings });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const removed = vi.spyOn(component.scoringColumnToggled, 'emit');

      const goalsMenu = ngMocks
        .findAll('.th-menu')
        .find((trigger) => trigger.nativeElement.getAttribute('aria-label')?.includes('Goals'))!;
      goalsMenu.nativeElement.dispatchEvent(new Event('click', { bubbles: true }));

      // The heading is the full stat name even for stats whose label already spells it out —
      // `statTooltip` returns null for those, which would have left the menu unheaded.
      expect(overlayText()).toContain('Goals');
      expect(overlayText()).toContain('Remove column');
      // Sorting is what clicking the heading does; the menu does not repeat it.
      expect(overlayText()).not.toContain('Sort highest first');
      expect(overlayText()).not.toContain('Sort lowest first');
      // Nor the weight, which has its own input in the row below, on screen at the same time.
      expect(overlayText()).not.toContain('Points per');

      const removeItem = [
        ...document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .menu-item'),
      ].find((item) => item.textContent?.includes('Remove column'))!;
      removeItem.dispatchEvent(new Event('click', { bubbles: true }));

      expect(removed).toHaveBeenCalledWith('goals');
    });

    it('offers a column its decimals without a mode being turned on first', () => {
      // useDefaultDecimals defaults to true — the setting used to be hidden behind turning that
      // off, which only ever hid the control: the table always formats from decimalSettings.
      getFixture({ columnControls: true });

      const goalsMenu = ngMocks
        .findAll('.th-menu')
        .find((trigger) => trigger.nativeElement.getAttribute('aria-label')?.includes('Goals'))!;
      goalsMenu.nativeElement.dispatchEvent(new Event('click', { bubbles: true }));

      expect(document.querySelectorAll('.cdk-overlay-container #menu-decimals-goals')).toHaveLength(
        1,
      );
    });

    it('leaves the weight row as the one place a weight is set', () => {
      getFixture({ scoringType: 'points', columnControls: true });

      const goalsMenu = ngMocks
        .findAll('.th-menu')
        .find((trigger) => trigger.nativeElement.getAttribute('aria-label')?.includes('Goals'))!;
      goalsMenu.nativeElement.dispatchEvent(new Event('click', { bubbles: true }));

      expect(document.querySelectorAll('.cdk-overlay-container #menu-weight-goals')).toHaveLength(
        0,
      );
      expect(ngMocks.findAll('.weight-row .weight-input').length).toBeGreaterThan(0);
    });

    it('moves the full-season action out of the GP header and into its menu', () => {
      const fixture = getFixture({ columnControls: true, showFullSeasonButton: true });
      const component = ngMocks.find(
        fixture.debugElement,
        ProjectionsTableHeaderComponent,
      ).componentInstance;
      const fullSeasonEmit = vi.spyOn(component.fullSeason, 'emit');

      // The GP cell would otherwise hold three targets: sort, the pill and the menu.
      expect(ngMocks.findAll('.full-season-pill')).toHaveLength(0);

      const gpMenu = ngMocks
        .findAll('.th-menu')
        .find((trigger) => trigger.nativeElement.getAttribute('aria-label')?.includes('GP'))!;
      gpMenu.nativeElement.dispatchEvent(new Event('click', { bubbles: true }));

      expect(overlayText()).toContain('Set a full 84-game season');
      const action = [
        ...document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .menu-item'),
      ].find((item) => item.textContent?.includes('84-game season'))!;
      action.dispatchEvent(new Event('click', { bubbles: true }));

      expect(fullSeasonEmit).toHaveBeenCalled();
    });

    it('offers the full-season action only on the GP column', () => {
      getFixture({ columnControls: true, showFullSeasonButton: true });

      const goalsMenu = ngMocks
        .findAll('.th-menu')
        .find((trigger) => trigger.nativeElement.getAttribute('aria-label')?.includes('Goals'))!;
      goalsMenu.nativeElement.dispatchEvent(new Event('click', { bubbles: true }));

      expect(overlayText()).not.toContain('84-game season');
    });

    it('never renders editing controls on a read-only shared header', () => {
      getFixture({ columnControls: true, readonly: true });

      expect(ngMocks.findAll('.th-menu')).toHaveLength(0);
    });

    it('expands one scale list at a time', () => {
      const component = getComponent({ columnControls: true, scaleSettings });

      component.toggleScaleList('gp');
      expect(component.expandedScaleList()).toEqual('gp');

      component.toggleScaleList('gp');
      expect(component.expandedScaleList()).toBeNull();
    });
  });
});
