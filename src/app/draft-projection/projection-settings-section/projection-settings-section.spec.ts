import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectionSettingsSectionComponent } from './projection-settings-section';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
  SkaterUtilityStatKey,
} from '../../models/stat-key.model';
import { ScoringType } from '../../models/projection.model';
import { ScaleConfig } from './model';
import { ToggleSwitchComponent } from './toggle-switch/toggle-switch';
import { SettingRowComponent } from './setting-row/setting-row';
import { StatInfoService } from '../../services/stat-info.service';

describe('ProjectionSettingsSectionComponent', () => {
  beforeEach(() =>
    MockBuilder(ProjectionSettingsSectionComponent)
      .keep(ToggleSwitchComponent)
      .keep(SettingRowComponent)
      .keep(StatInfoService),
  );

  const defaultActiveScoringColumns = new Set<ScoringStatKey>([
    'goals',
    'assists',
    'sog',
    'hits',
    'blocks',
  ]);
  const MOCK_SCALE_SETTINGS: Record<SkaterUtilityStatKey, ScaleConfig> = {
    gp: { scale: true, scalableStats: defaultActiveScoringColumns },
    toiPerGame: { scale: true, scalableStats: defaultActiveScoringColumns },
  };

  const getComponent = (
    activeUtilityColumns: Set<SkaterUtilityStatKey> = new Set(['gp', 'toiPerGame']),
    activeScoringColumns: Set<ScoringStatKey> = defaultActiveScoringColumns,
    scoringType: ScoringType = 'points',
  ) =>
    MockRender(ProjectionSettingsSectionComponent, {
      activeUtilityColumns,
      activeScoringColumns,
      scaleSettings: MOCK_SCALE_SETTINGS,
      scoringType,
    }).point.componentInstance;

  // Helper that renders and opens all sections for template-level assertions.
  const getExpandedFixture = (
    activeUtilityColumns: Set<SkaterUtilityStatKey> = new Set(['gp', 'toiPerGame']),
    activeScoringColumns: Set<ScoringStatKey> = defaultActiveScoringColumns,
    scoringType: ScoringType = 'points',
  ) => {
    const fixture = MockRender(ProjectionSettingsSectionComponent, {
      activeUtilityColumns,
      activeScoringColumns,
      scaleSettings: MOCK_SCALE_SETTINGS,
      scoringType,
    });
    const component = fixture.point.componentInstance;
    component.toggleSectionVisible();
    component.toggleUtilityStatsVisible();
    component.toggleAdditionalSettingsVisible();
    fixture.detectChanges();
    return { fixture, component };
  };

  describe('slimmed-down mode', () => {
    it('hides the utility stats group and decimals setting when disabled', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: MOCK_SCALE_SETTINGS,
        scoringType: 'points',
        showDecimalsSetting: false,
        showUtilityStats: false,
        initiallyExpanded: true,
      });
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('League Type');
      expect(text).not.toContain('Utility Stats');
      expect(text).not.toContain('Use default decimal places');
    });

    it('shows the groups expanded and non-collapsible when collapsibleGroups is false', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: MOCK_SCALE_SETTINGS,
        scoringType: 'points',
        showUtilityStats: false,
        initiallyExpanded: true,
        collapsibleGroups: false,
      });
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('League Type');
      expect(text).toContain('Points');
      expect(text).not.toContain('League Settings');
      expect(text).not.toContain('Additional Settings');
      expect(fixture.nativeElement.querySelectorAll('.settings-group-header').length).toEqual(0);
      expect(fixture.nativeElement.querySelectorAll('app-stat-group').length).toEqual(2);
    });
  });

  describe('toggle', () => {
    it('should remove an active utility column when toggled', () => {
      const component = getComponent(new Set(['gp', 'toiPerGame']));
      component.toggleActiveUtilityColumn('gp');
      expect(component.activeUtilityColumns().has('gp')).toEqual(false);
    });

    it('should add an inactive utility column when toggled', () => {
      const component = getComponent(new Set<SkaterUtilityStatKey>(['toiPerGame']));
      component.toggleActiveUtilityColumn('gp');
      expect(component.activeUtilityColumns().has('gp')).toEqual(true);
    });

    it('should return to the original state after two toggles', () => {
      const component = getComponent(new Set(['gp', 'toiPerGame']));
      component.toggleActiveUtilityColumn('gp');
      component.toggleActiveUtilityColumn('gp');
      expect(component.activeUtilityColumns().has('gp')).toEqual(true);
    });

    it('should only affect the targeted column', () => {
      const component = getComponent(new Set(['gp', 'toiPerGame']));
      component.toggleActiveUtilityColumn('gp');
      expect(component.activeUtilityColumns().has('toiPerGame')).toEqual(true);
    });
  });

  describe('template', () => {
    it('should render an "Additional Settings" header', () => {
      getExpandedFixture();
      const titles = ngMocks.findAll('.settings-group-title');
      expect(
        titles.some((t) => t.nativeElement.textContent.trim() === 'Additional Settings'),
      ).toEqual(true);
    });

    it('should render a toggle for each utility stat key', () => {
      const { component } = getExpandedFixture();
      const toggles = ngMocks.findAll('.toggle-switch');
      // Each utility stat has a main toggle; each active utility stat also has a scale sub-toggle.
      // There is also one toggle for the "Use default decimal places" setting.
      // Per-stat toggles are hidden by default (advanced options collapsed).
      const expected = SKATER_UTILITY_STAT_KEYS.length + component.activeUtilityColumns().size + 1;
      expect(toggles.length).toEqual(expected);
    });

    it('should apply the "on" class to active utility column toggles', () => {
      getExpandedFixture(new Set<SkaterUtilityStatKey>(['gp']));
      const toggles = ngMocks.findAll('.toggle-switch');
      const onToggles = toggles.filter((t) => t.classes['on']);
      // useDefaultDecimals is on (default true) + gp main toggle is "on" + gp scale sub-toggle is "on" (defaults to true)
      expect(onToggles.length).toEqual(3);
    });

    it('should only apply the "on" class to the decimals toggle when no utility columns are active', () => {
      getExpandedFixture(new Set<SkaterUtilityStatKey>());
      const toggles = ngMocks.findAll('.toggle-switch');
      const onToggles = toggles.filter((t) => t.classes['on']);
      expect(onToggles.length).toEqual(1);
      // The decimals toggle now lives in the last group (Additional Settings).
      expect(toggles[toggles.length - 1].classes['on']).toEqual(true);
    });

    it('should call toggle() when a toggle switch is clicked', () => {
      const { component } = getExpandedFixture(new Set<SkaterUtilityStatKey>(['gp', 'toiPerGame']));
      const toggles = ngMocks.findAll('.toggle-switch');
      const firstUtilityToggle = toggles[0]; // utility main toggles come first; decimals is now last
      ngMocks.click(firstUtilityToggle);
      expect(component.activeUtilityColumns().size).not.toEqual(2);
    });

    it('should render checkboxes for individual scoring stats when advanced options are expanded', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: MOCK_SCALE_SETTINGS,
        scoringType: 'points',
      });
      const component = fixture.point.componentInstance;
      component.toggleSectionVisible();
      component.toggleUtilityStatsVisible();
      component.toggleAdvanced('gp');
      fixture.detectChanges();

      const checkboxes = ngMocks.findAll('input[type="checkbox"]');
      expect(checkboxes.length).toEqual(defaultActiveScoringColumns.size);
    });

    it('should exclude percentage and average stats from the scaling options', () => {
      const activeScoringColumns = new Set<ScoringStatKey>(['goals', 'shPct', 'svPct', 'gaa']);
      const component = getComponent(new Set<SkaterUtilityStatKey>(['gp']), activeScoringColumns);

      const available = component.getAvailableScoringStats('gp');

      expect(available).toContain('goals');
      expect(available).not.toContain('shPct');
      expect(available).not.toContain('svPct');
      expect(available).not.toContain('gaa');
    });

    it('should call toggleScaleStat() when a checkbox is clicked', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: MOCK_SCALE_SETTINGS,
        scoringType: 'points',
      });
      const component = fixture.point.componentInstance;
      component.toggleSectionVisible();
      component.toggleUtilityStatsVisible();
      component.toggleAdvanced('gp');
      fixture.detectChanges();

      const checkboxes = ngMocks.findAll<HTMLInputElement>('input[type="checkbox"]');
      const initialState = component.isScaleStatActive('goals', 'gp');
      checkboxes[0].nativeElement.dispatchEvent(new Event('change'));
      expect(component.isScaleStatActive('goals', 'gp')).not.toEqual(initialState);
    });

    it('should filter out goalie stats for toiPerGame scaling options', () => {
      const activeScoringColumns = new Set<ScoringStatKey>([
        ...SKATER_SCORING_STAT_KEYS.slice(0, 3),
        ...GOALIE_SCORING_STAT_KEYS.slice(0, 3),
      ]);
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['toiPerGame']),
        activeScoringColumns,
        scaleSettings: MOCK_SCALE_SETTINGS,
        scoringType: 'points',
      });
      const component = fixture.point.componentInstance;
      component.toggleSectionVisible();
      component.toggleUtilityStatsVisible();
      component.toggleAdvanced('toiPerGame');
      fixture.detectChanges();

      const labels = ngMocks.findAll('.stat-checkbox-label');
      expect(labels.length).toEqual(3); // Only skater stats

      // Verify no goalie stats are present
      const labelTexts = labels.map((l) => l.nativeElement.textContent.trim());
      GOALIE_SCORING_STAT_KEYS.forEach((goalieStat) => {
        expect(labelTexts).not.toContain(goalieStat);
      });
    });

    it('should show both skater and goalie stats for gp scaling options', () => {
      const activeScoringColumns = new Set<ScoringStatKey>([
        ...SKATER_SCORING_STAT_KEYS.slice(0, 3),
        ...GOALIE_SCORING_STAT_KEYS.slice(0, 3),
      ]);
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns,
        scaleSettings: MOCK_SCALE_SETTINGS,
        scoringType: 'points',
      });
      const component = fixture.point.componentInstance;
      component.toggleSectionVisible();
      component.toggleUtilityStatsVisible();
      component.toggleAdvanced('gp');
      fixture.detectChanges();

      const labels = ngMocks.findAll('.stat-checkbox-label');
      expect(labels.length).toEqual(6); // Both skater and goalie stats
    });
  });

  describe('visibility toggles', () => {
    it('should toggle additional settings visibility', () => {
      const component = getComponent();
      expect(component.isAdditionalSettingsVisible()).toEqual(false);
      component.toggleAdditionalSettingsVisible();
      expect(component.isAdditionalSettingsVisible()).toEqual(true);
    });

    it('should toggle utility stats visibility', () => {
      const component = getComponent();
      expect(component.isUtilityStatsVisible()).toEqual(false);
      component.toggleUtilityStatsVisible();
      expect(component.isUtilityStatsVisible()).toEqual(true);
    });

    it('should hide additional settings when isAdditionalSettingsVisible is false', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: MOCK_SCALE_SETTINGS,
        scoringType: 'points',
      });
      const component = fixture.point.componentInstance;
      component.toggleSectionVisible();
      component.toggleAdditionalSettingsVisible();
      fixture.detectChanges();

      let settingRows = ngMocks.findAll(SettingRowComponent);
      expect(
        settingRows.some((r) => r.componentInstance.name() === 'Use default decimal places'),
      ).toEqual(true);

      component.toggleAdditionalSettingsVisible();
      fixture.detectChanges();

      settingRows = ngMocks.findAll(SettingRowComponent);
      expect(
        settingRows.some((r) => r.componentInstance.name() === 'Use default decimal places'),
      ).toEqual(false);
    });

    it('should hide utility stat settings when isUtilityStatsVisible is false', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: MOCK_SCALE_SETTINGS,
        scoringType: 'points',
      });
      const component = fixture.point.componentInstance;
      component.toggleSectionVisible();
      component.toggleLeagueSettingsVisible();
      component.toggleUtilityStatsVisible();
      fixture.detectChanges();

      let settingRows = ngMocks.findAll(SettingRowComponent);
      // GP and its scale toggle are active and should be visible
      expect(settingRows.length).toBeGreaterThan(0);

      component.toggleUtilityStatsVisible();
      fixture.detectChanges();

      settingRows = ngMocks.findAll(SettingRowComponent);
      // Utility stats hidden; League Settings + Additional Settings are also collapsed,
      // so no setting rows remain
      expect(settingRows.length).toEqual(0);
    });
  });

  describe('min goalie games', () => {
    it('clamps the minimum goalie games to 0..82', () => {
      const component = getComponent();

      component.onMinGoalieGamesInput({ target: { value: '-5' } } as unknown as Event);
      expect(component.minGoalieGames()).toEqual(0);

      component.onMinGoalieGamesInput({ target: { value: '100' } } as unknown as Event);
      expect(component.minGoalieGames()).toEqual(82);

      component.onMinGoalieGamesInput({ target: { value: '25' } } as unknown as Event);
      expect(component.minGoalieGames()).toEqual(25);
    });
  });
});
