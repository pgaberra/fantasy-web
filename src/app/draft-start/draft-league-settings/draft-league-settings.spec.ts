import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { DraftLeagueSettingsComponent } from './draft-league-settings';
import { LeagueSettings } from '../../shared/league-settings/league-settings';
import { LeagueImportButtonComponent } from '../../shared/league-import-button/league-import-button';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_STAT_WEIGHTS,
} from '../../draft-projection/projection-defaults';

describe('DraftLeagueSettingsComponent', () => {
  const league = (): LeagueSettings => ({
    scoringType: 'points',
    statWeights: DEFAULT_STAT_WEIGHTS,
    activeScoringColumns: new Set(['goals', 'assists']),
    activeUtilityColumns: new Set(['gp']),
    leagueSize: DEFAULT_LEAGUE_SIZE,
    rosterSlots: DEFAULT_ROSTER_SLOTS,
    minGoalieGames: 30,
    yahooSync: null,
    espnSync: null,
    lastEspnLeagueId: null,
  });

  beforeEach(() => MockBuilder(DraftLeagueSettingsComponent).keep(LeagueImportButtonComponent));

  const render = (settings: LeagueSettings = league()) => {
    const fixture = MockRender(DraftLeagueSettingsComponent, { settings });
    fixture.detectChanges();
    return fixture;
  };

  it('switches the league between points and category', () => {
    const fixture = render();
    const component = fixture.point.componentInstance;

    component.selectScoringType('category');

    expect(component.settings().scoringType).toEqual('category');
  });

  it('turns a stat on and off without touching the others', () => {
    const component = render().point.componentInstance;

    component.toggleScoringColumn('hits');
    expect([...component.settings().activeScoringColumns]).toEqual(['goals', 'assists', 'hits']);

    component.toggleScoringColumn('goals');
    expect([...component.settings().activeScoringColumns]).toEqual(['assists', 'hits']);
  });

  // As in the editor: a points league with nothing imported has nothing behind the button.
  it('offers League setup only where there is something behind it', () => {
    const fixture = render();
    const setupButton = () => fixture.nativeElement.querySelector('.league-setup');

    expect(setupButton()).toBeNull();

    fixture.point.componentInstance.selectScoringType('category');
    fixture.detectChanges();

    expect(setupButton()).not.toBeNull();
  });

  it('invites an import, then names the league it came from', () => {
    const fixture = render();
    expect(fixture.nativeElement.textContent).toContain('Import league');

    fixture.point.componentInstance.applyEspn({
      leagueId: '42',
      leagueName: 'Puck Luck',
      settings: {
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: [],
        rosterSlots: DEFAULT_ROSTER_SLOTS,
        unsupportedRosterCodes: [],
        unsupportedStats: [],
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Synced with Puck Luck');
    expect(fixture.point.componentInstance.settings().scoringType).toEqual('category');
  });

  it('keeps the import dialog open when the league scores something it cannot map', () => {
    const component = render().point.componentInstance;
    component.showSyncDialog.set(true);

    component.applyYahoo({
      leagueKey: 'nhl.l.1',
      leagueName: 'HHL',
      settings: {
        scoringType: 'points',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: [],
        rosterSlots: DEFAULT_ROSTER_SLOTS,
        unsupportedRosterCodes: [],
        unsupportedStats: ['faceoffs won'],
      },
    });

    expect(component.showSyncDialog()).toBe(true);
  });
});
