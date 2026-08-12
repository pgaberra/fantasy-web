import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueSettingsMenuComponent } from './league-settings-menu';
import { ScoringStatKey } from '../../../models/stat-key.model';
import { StatLabelPipe } from '../../../pipes/stat-label.pipe';

describe('LeagueSettingsMenuComponent', () => {
  // The weight list is asserted by the labels it renders, so the pipe has to be the real one.
  beforeEach(() => MockBuilder(LeagueSettingsMenuComponent).keep(StatLabelPipe));

  const getFixture = (overrides: object = {}) =>
    MockRender(LeagueSettingsMenuComponent, {
      scoringType: 'category',
      syncedLeagueName: null,
      ...overrides,
    });

  it('says nothing about a league while none has been imported', () => {
    getFixture();
    expect(ngMocks.findAll('.sync-provenance')).toHaveLength(0);
  });

  it('names the league the settings came from once one is connected', () => {
    getFixture({ syncedLeagueName: 'Puck Luck Dynasty' });

    const provenance = ngMocks.find('.sync-provenance');
    expect(provenance.nativeElement.textContent).toContain('Puck Luck Dynasty');
  });

  it('asks the page to reopen the import flow from the menu', () => {
    const fixture = getFixture({ syncedLeagueName: 'Puck Luck Dynasty' });
    const emit = vi.spyOn(fixture.point.componentInstance.manageSync, 'emit');

    const action = ngMocks
      .findAll('.menu-item')
      .find((item) => item.nativeElement.textContent.includes('Re-sync'))!;
    action.nativeElement.dispatchEvent(new Event('click', { bubbles: true }));

    expect(emit).toHaveBeenCalled();
  });

  it('hides the category-only ranking fields in a points league', () => {
    getFixture({ scoringType: 'points' });
    expect(ngMocks.findAll('#league-size-input')).toHaveLength(0);
    expect(ngMocks.findAll('#min-goalie-games-input')).toHaveLength(0);
  });

  it('offers a weight for every stat the points league scores, in column order', () => {
    getFixture({
      scoringType: 'points',
      activeScoringColumns: new Set<ScoringStatKey>(['assists', 'goals', 'w']),
      statWeights: { goals: 6, assists: 4, w: 5 } as Record<ScoringStatKey, number>,
    });

    const labels = ngMocks
      .findAll('.weight-list label')
      .map((label) => label.nativeElement.textContent.trim());
    expect(labels).toEqual(['Goals', 'Assists', 'Wins']);
  });

  it('leaves the stats it does not score out of the weight list', () => {
    getFixture({
      scoringType: 'points',
      activeScoringColumns: new Set<ScoringStatKey>(['goals']),
      statWeights: { goals: 6, assists: 4 } as Record<ScoringStatKey, number>,
    });

    expect(ngMocks.findAll('.weight-list label')).toHaveLength(1);
    expect(ngMocks.findAll('#league-weight-assists')).toHaveLength(0);
  });

  it('says where to add stats when the projection scores none', () => {
    getFixture({ scoringType: 'points', activeScoringColumns: new Set<ScoringStatKey>() });

    const list = ngMocks.find('.weight-list');
    expect(list.nativeElement.textContent).toContain('Columns');
  });

  it('keeps the other weights untouched when one is edited', () => {
    const component = getFixture({
      scoringType: 'points',
      activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
      statWeights: { goals: 6, assists: 4 } as Record<ScoringStatKey, number>,
    }).point.componentInstance;

    component.onWeightInput('goals', { target: { value: '9.5' } } as unknown as Event);

    expect(component.statWeights()).toEqual({ goals: 9.5, assists: 4 });
  });

  it('ignores a weight edit that is not a number, rather than storing NaN', () => {
    const component = getFixture({
      scoringType: 'points',
      activeScoringColumns: new Set<ScoringStatKey>(['goals']),
      statWeights: { goals: 6 } as Record<ScoringStatKey, number>,
    }).point.componentInstance;

    component.onWeightInput('goals', { target: { value: 'abc' } } as unknown as Event);

    expect(component.statWeights()).toEqual({ goals: 6 });
  });

  it('shows no weights in a category league, where they do not score anything', () => {
    getFixture({
      scoringType: 'category',
      activeScoringColumns: new Set<ScoringStatKey>(['goals', 'assists']),
    });

    expect(ngMocks.findAll('.weight-list')).toHaveLength(0);
  });

  it('clamps league size and the goalie games minimum to their allowed range', () => {
    const component = getFixture().point.componentInstance;
    const inputEvent = (value: string) => ({ target: { value } }) as unknown as Event;

    component.onLeagueSizeInput(inputEvent('99'));
    expect(component.leagueSize()).toEqual(30);

    component.onMinGoalieGamesInput(inputEvent('-5'));
    expect(component.minGoalieGames()).toEqual(0);
  });
});
