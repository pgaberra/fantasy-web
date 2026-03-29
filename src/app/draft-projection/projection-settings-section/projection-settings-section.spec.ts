import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ProjectionSettingsSectionComponent } from './projection-settings-section';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
  SKATER_UTILITY_STAT_KEYS,
  SkaterUtilityStatKey,
} from '../../models/stat-key.model';
import { DEFAULT_SCALE_SETTINGS } from './model';
import { ToggleSwitchComponent } from './toggle-switch/toggle-switch';
import { SettingRowComponent } from './setting-row/setting-row';

describe('ProjectionSettingsSectionComponent', () => {
  beforeEach(() =>
    MockBuilder(ProjectionSettingsSectionComponent)
      .keep(ToggleSwitchComponent)
      .keep(SettingRowComponent),
  );

  const defaultActiveScoringColumns = new Set<ScoringStatKey>(['goals', 'assists', 'sog', 'hits', 'blocks']);

  const getComponent = (
    activeUtilityColumns: Set<SkaterUtilityStatKey> = new Set(['gp', 'toiPerGame']),
    activeScoringColumns: Set<ScoringStatKey> = defaultActiveScoringColumns,
  ) =>
    MockRender(ProjectionSettingsSectionComponent, {
      activeUtilityColumns,
      activeScoringColumns,
      scaleSettings: DEFAULT_SCALE_SETTINGS,
    }).point.componentInstance;

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
    it('should render a "General" header', () => {
      getComponent();
      const titles = ngMocks.findAll('.settings-group-title');
      expect(titles.some(t => t.nativeElement.textContent.trim() === 'General')).toEqual(true);
    });

    it('should render a toggle for each utility stat key', () => {
      const component = getComponent();
      const toggles = ngMocks.findAll('.toggle-switch');
      // Each utility stat has a main toggle; each active utility stat also has a scale sub-toggle.
      // There is also one toggle for the "Use default decimal places" setting.
      // Per-stat toggles are hidden by default (advanced options collapsed).
      const expected = SKATER_UTILITY_STAT_KEYS.length + component.activeUtilityColumns().size + 1;
      expect(toggles.length).toEqual(expected);
    });

    it('should apply the "on" class to active utility column toggles', () => {
      getComponent(new Set<SkaterUtilityStatKey>(['gp']));
      const toggles = ngMocks.findAll('.toggle-switch');
      const onToggles = toggles.filter(t => t.classes['on']);
      // useDefaultDecimals is on (default true) + gp main toggle is "on" + gp scale sub-toggle is "on" (defaults to true)
      expect(onToggles.length).toEqual(3);
    });

    it('should only apply the "on" class to the decimals toggle when no utility columns are active', () => {
      getComponent(new Set<SkaterUtilityStatKey>());
      const toggles = ngMocks.findAll('.toggle-switch');
      const onToggles = toggles.filter(t => t.classes['on']);
      expect(onToggles.length).toEqual(1);
      expect(toggles[0].classes['on']).toBe(true);
    });

    it('should call toggle() when a toggle switch is clicked', () => {
      const component = getComponent(new Set<SkaterUtilityStatKey>(['gp', 'toiPerGame']));
      const toggles = ngMocks.findAll('.toggle-switch');
      const firstUtilityToggle = toggles[1]; // index 0 is the "Use default decimal places" toggle
      ngMocks.click(firstUtilityToggle);
      expect(component.activeUtilityColumns().size).not.toEqual(2);
    });

    it('should render checkboxes for individual scoring stats when advanced options are expanded', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: DEFAULT_SCALE_SETTINGS,
      });
      const component = fixture.point.componentInstance;
      component.toggleAdvanced('gp');
      fixture.detectChanges();

      const checkboxes = ngMocks.findAll('input[type="checkbox"]');
      expect(checkboxes.length).toEqual(defaultActiveScoringColumns.size);
    });

    it('should call toggleScaleStat() when a checkbox is clicked', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: DEFAULT_SCALE_SETTINGS,
      });
      const component = fixture.point.componentInstance;
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
        scaleSettings: DEFAULT_SCALE_SETTINGS,
      });
      const component = fixture.point.componentInstance;
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
        scaleSettings: DEFAULT_SCALE_SETTINGS,
      });
      const component = fixture.point.componentInstance;
      component.toggleAdvanced('gp');
      fixture.detectChanges();

      const labels = ngMocks.findAll('.stat-checkbox-label');
      expect(labels.length).toEqual(6); // Both skater and goalie stats
    });
  });

  describe('visibility toggles', () => {
    it('should toggle general visibility', () => {
      const component = getComponent();
      expect(component.isGeneralVisible()).toEqual(true);
      component.toggleGeneralVisible();
      expect(component.isGeneralVisible()).toEqual(false);
    });

    it('should toggle utility stats visibility', () => {
      const component = getComponent();
      expect(component.isUtilityStatsVisible()).toEqual(true);
      component.toggleUtilityStatsVisible();
      expect(component.isUtilityStatsVisible()).toEqual(false);
    });

    it('should hide general settings when isGeneralVisible is false', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: DEFAULT_SCALE_SETTINGS,
      });
      const component = fixture.point.componentInstance;

      let settingRows = ngMocks.findAll(SettingRowComponent);
      expect(settingRows.some(r => r.componentInstance.name() === 'Use default decimal places')).toBe(true);

      component.toggleGeneralVisible();
      fixture.detectChanges();

      settingRows = ngMocks.findAll(SettingRowComponent);
      expect(settingRows.some(r => r.componentInstance.name() === 'Use default decimal places')).toBe(false);
    });

    it('should hide utility stat settings when isUtilityStatsVisible is false', () => {
      const fixture = MockRender(ProjectionSettingsSectionComponent, {
        activeUtilityColumns: new Set<SkaterUtilityStatKey>(['gp']),
        activeScoringColumns: defaultActiveScoringColumns,
        scaleSettings: DEFAULT_SCALE_SETTINGS,
      });
      const component = fixture.point.componentInstance;

      let settingRows = ngMocks.findAll(SettingRowComponent);
      // GP and its scale toggle are active and should be visible
      expect(settingRows.length).toBeGreaterThan(1);

      component.toggleUtilityStatsVisible();
      fixture.detectChanges();

      settingRows = ngMocks.findAll(SettingRowComponent);
      // Only "Use default decimal places" should be visible (if it's not toggled off)
      expect(settingRows.every(r => r.componentInstance.name() === 'Use default decimal places')).toBe(true);
    });
  });
});
