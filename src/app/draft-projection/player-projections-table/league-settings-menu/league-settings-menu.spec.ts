import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueSettingsMenuComponent } from './league-settings-menu';

describe('LeagueSettingsMenuComponent', () => {
  beforeEach(() => MockBuilder(LeagueSettingsMenuComponent));

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

  it('does not carry the stat weights, which are set in the header row instead', () => {
    getFixture({ scoringType: 'points' });

    expect(ngMocks.findAll('.weight-list')).toHaveLength(0);
    expect(ngMocks.findAll('input[type="number"]')).toHaveLength(0);
  });

  it('heads every section with the same class and sentence-cased text', () => {
    getFixture();

    // One class means one font treatment, and the uppercasing stays the stylesheet's business
    // rather than something each heading spells out for itself.
    const headings = ngMocks.findAll('.menu-title').map((h) => h.nativeElement.textContent.trim());
    expect(headings).toEqual(['League setup', 'Roster slots']);
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
