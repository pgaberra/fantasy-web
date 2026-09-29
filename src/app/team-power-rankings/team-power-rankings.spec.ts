import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../environments/environment';
import { TeamPowerRankingsComponent } from './team-power-rankings';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { LeaguesResponse } from '../api/models/leagues-response';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { FeatureService } from '../services/feature.service';
import { LeagueSummaryService } from '../services/league-summary.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { YahooService } from '../services/yahoo.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { RankBy } from './rank-by';
import { EspnLeagueSyncComponent } from '../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';
import { PlatformTabsComponent } from '../shared/platform-tabs/platform-tabs';

const leagues: LeaguesResponse = {
  leagues: [
    { leagueKey: '465.l.1', name: 'Beer League', numTeams: 12 },
    { leagueKey: '465.l.2', name: 'Work League', numTeams: 10 },
  ],
};

const summary: LeagueSummaryResponse = {
  source: 'model',
  premium: false,
  scoringType: 'points',
  status: 'FINISHED',
  picks: 24,
  unprojectedPlayers: 0,
  restOfSeason: false,
  categoryKeys: ['goals'],
  positionKeys: ['C', 'BN'],
  teams: [
    { teamId: 't1', name: 'Mine', mine: true, total: 90, values: { goals: 90, C: 90, BN: 0 } },
    { teamId: 't2', name: 'Theirs', mine: false, total: 70, values: { goals: 70, C: 70, BN: 0 } },
  ],
};

const boardSummary = (id: string, name: string, following: boolean): ProjectionSummaryResponse => ({
  id,
  name,
  kind: following ? 'imported' : 'projection',
  season: '20262027',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  draftStatus: 'none',
  autoNamed: false,
  origin: following ? { shareToken: 'tok', authorUsername: 'someone' } : undefined,
});

const boards = [boardSummary('b1', 'My board', false), boardSummary('b2', 'Their board', true)];

const draftSummary = (
  id: string,
  name: string,
  from: Partial<ProjectionSummaryResponse>,
  draftStatus: ProjectionSummaryResponse['draftStatus'] = 'finished',
): ProjectionSummaryResponse => ({
  ...boardSummary(id, name, false),
  kind: 'draft',
  draftStatus,
  ...from,
});

/** A mock drafted off one of the user's boards, one off the AI preset, and one still going. */
const drafts = [
  draftSummary('d1', 'Mock #1', { sourceProjectionId: 'b1' }),
  draftSummary('d2', 'Mock #2', { preset: 'model' }),
  draftSummary('d3', 'Mock #3', {}, 'in_progress'),
];

describe('TeamPowerRankingsComponent', () => {
  const yahooLeague = vi.fn<(key: string, rankBy?: RankBy) => Observable<LeagueSummaryResponse>>(
    () => of(summary),
  );
  const espnCall = vi.fn<(id: string, rankBy?: RankBy) => Observable<LeagueSummaryResponse>>(() =>
    of(summary),
  );
  const draftCall = vi.fn<(id: string, rankBy?: RankBy) => Observable<LeagueSummaryResponse>>(() =>
    of(summary),
  );
  const listAll = vi.fn<() => Observable<ProjectionSummaryResponse[]>>(() =>
    of([...boards, ...drafts]),
  );
  const aiProjection = vi.fn(() => true);
  const myLeagues = vi.fn<() => Observable<LeaguesResponse>>(() => of(leagues));
  const connectionStatus = vi.fn<() => Observable<{ connected: boolean }>>(() =>
    of({ connected: true }),
  );
  const leagueDraftSync = vi.fn(() => true);
  /** The `?draft=` the page was opened with, as a finished draft's link carries it. */
  let linkedDraft: string | null = null;
  const originalPayments = environment.paymentsEnabled;
  const originalSharedNotice = environment.sharedNoticeEnabled;
  const originalEspnLeagues = environment.espnLeaguesEnabled;

  const render = async () => {
    const fixture = MockRender(TeamPowerRankingsComponent);
    await fixture.whenStable();
    return fixture;
  };

  /** Picking a league in the dropdown, as a reader would. There is nothing else to press. */
  const choose = async (
    fixture: Awaited<ReturnType<typeof render>>,
    _component: TeamPowerRankingsComponent,
    leagueKey: string,
  ) => {
    const select = fixture.nativeElement.querySelector('.league-select') as HTMLSelectElement;
    select.value = leagueKey;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    environment.paymentsEnabled = true;
    yahooLeague.mockReset();
    yahooLeague.mockReturnValue(of(summary));
    myLeagues.mockReset();
    myLeagues.mockReturnValue(of(leagues));
    connectionStatus.mockReset();
    connectionStatus.mockReturnValue(of({ connected: true }));
    leagueDraftSync.mockReturnValue(true);
    aiProjection.mockReturnValue(true);
    draftCall.mockReset();
    draftCall.mockReturnValue(of(summary));
    espnCall.mockReset();
    espnCall.mockReturnValue(of(summary));
    environment.espnLeaguesEnabled = true;
    listAll.mockReset();
    listAll.mockReturnValue(of([...boards, ...drafts]));
    linkedDraft = null;
    return MockBuilder(TeamPowerRankingsComponent)
      .keep(YahooLeaguePicker)
      .mock(YahooService, {
        myLeagues,
        connectionStatus,
        startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
      } as never)
      .mock(YahooConnectReturnService)
      .keep(PlatformTabsComponent)
      .mock(LeagueSummaryService, { yahooLeague, draft: draftCall, espnLeague: espnCall })
      .mock(ProjectionStorageService, { listAll })
      .mock(FeatureService, { leagueDraftSync, aiProjection } as never)
      .provide({
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (key: string) => (key === 'draft' ? linkedDraft : null),
            },
          },
        },
      });
  });

  afterEach(() => {
    environment.paymentsEnabled = originalPayments;
    environment.sharedNoticeEnabled = originalSharedNotice;
    environment.espnLeaguesEnabled = originalEspnLeagues;
  });

  /**
   * A dropdown of the account's leagues and no button: picking one reads it. With several to
   * choose from none is picked for the reader, so nothing is read until they do.
   */
  it('offers the leagues on the account in a dropdown and reads the one picked', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(component.picker.leagues()).toHaveLength(2);
    expect(component.picker.selectedKey()).toBeNull();
    expect(yahooLeague).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.rankings-note')?.textContent).toContain(
      'Select a league',
    );
    expect(fixture.nativeElement.querySelector('.league-picker button')).toBeNull();

    await choose(fixture, component, '465.l.1');

    expect(yahooLeague).toHaveBeenCalledWith('465.l.1', 'model');
    expect(component.leagueName()).toEqual('Beer League');
    expect(component.leagueProjection()?.teams).toHaveLength(2);
    expect(component.scoreHeading()).toEqual('Total Points');
  });

  /** The dropdown stays: a second league is picked from it, not from a trip back to a list. */
  it('reads another league without leaving the one on screen', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    await choose(fixture, component, '465.l.2');

    expect(yahooLeague).toHaveBeenLastCalledWith('465.l.2', 'model');
    expect(component.leagueName()).toEqual('Work League');
  });

  /** One league is not a choice, so the page opens on its rankings. */
  it('reads the only league on the account without being asked', async () => {
    myLeagues.mockReturnValue(of({ leagues: [leagues.leagues[0]] }));
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(yahooLeague).toHaveBeenCalledWith('465.l.1', 'model');
    expect(component.leagueName()).toEqual('Beer League');
  });

  /**
   * A mock draft's picks are nowhere but here, so the user's finished drafts are leagues to pick
   * too, and a picked one is ranked by what it was played against.
   */
  it('offers the finished drafts beside the leagues, each ranked by its own projection', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;

    const groups = Array.from(
      fixture.nativeElement.querySelectorAll('.league-select optgroup') as NodeListOf<HTMLElement>,
    ).map((group) => group.getAttribute('label'));
    expect(groups).toEqual(['Yahoo', 'My Drafts']);
    expect(component.drafts().map((draft) => draft.id)).toEqual(['d1', 'd2']);

    await choose(fixture, component, 'draft:d1');

    expect(draftCall).toHaveBeenLastCalledWith('d1', 'board:b1');
    expect(yahooLeague).not.toHaveBeenCalled();
    expect(component.leagueName()).toEqual('Mock #1');
    expect(component.isRankedBy('board:b1')).toBe(true);

    await choose(fixture, component, 'draft:d2');

    expect(draftCall).toHaveBeenLastCalledWith('d2', 'model');
  });

  /** Back to a Yahoo league reads the league, ranked by whatever the second dropdown says. */
  it('reads a Yahoo league again after a draft', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, 'draft:d1');

    await choose(fixture, component, '465.l.1');

    expect(yahooLeague).toHaveBeenLastCalledWith('465.l.1', 'board:b1');
    expect(component.draftId()).toBeNull();
    expect(component.leagueName()).toEqual('Beer League');
  });

  /**
   * The board's button: the draft is read, and read once, by the projection it was played
   * against — not by the default first and then again.
   */
  it('opens on the draft a link names, ranked by its own projection', async () => {
    linkedDraft = 'd1';
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(draftCall).toHaveBeenCalledTimes(1);
    expect(draftCall).toHaveBeenCalledWith('d1', 'board:b1');
    expect(component.leagueName()).toEqual('Mock #1');
    const select = fixture.nativeElement.querySelector('.league-select') as HTMLSelectElement;
    expect(select.value).toEqual('draft:d1');
  });

  /**
   * A draft that followed a Yahoo league sits beside that league in the dropdown, and its board's
   * link opens on the draft — not on the league, even on an account whose only league it is and
   * which would otherwise open on it.
   */
  it('opens a followed draft on the draft, not on its league', async () => {
    myLeagues.mockReturnValue(of({ leagues: [leagues.leagues[1]] }));
    linkedDraft = 'd2';
    listAll.mockReturnValue(
      of([...boards, draftSummary('d2', 'Mock #2', { preset: 'last_season' })]),
    );
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(draftCall).toHaveBeenCalledTimes(1);
    expect(draftCall).toHaveBeenCalledWith('d2', 'last_season');
    expect(yahooLeague).not.toHaveBeenCalled();
    expect(component.leagueName()).toEqual('Mock #2');
    const select = fixture.nativeElement.querySelector('.league-select') as HTMLSelectElement;
    expect(select.value).toEqual('draft:d2');
  });

  /** The drafts need no Yahoo account, so they are offered beside the button that connects one. */
  it('offers the drafts to an account with no Yahoo behind it', async () => {
    connectionStatus.mockReturnValue(of({ connected: false }));
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(fixture.nativeElement.querySelector('.league-picker button')?.textContent).toContain(
      'Connect Yahoo account',
    );
    const groups = Array.from(
      fixture.nativeElement.querySelectorAll('.league-select optgroup') as NodeListOf<HTMLElement>,
    ).map((group) => group.getAttribute('label'));
    expect(groups).toEqual(['My Drafts']);
    expect(fixture.nativeElement.querySelector('#rank-by')).not.toBeNull();

    await choose(fixture, component, 'draft:d2');

    expect(draftCall).toHaveBeenLastCalledWith('d2', 'model');
  });

  /** Mid-season the model's totals cover the games left, and the line above the table says so. */
  it('says when the model ranked the rest of the season', async () => {
    yahooLeague.mockReturnValue(of({ ...summary, restOfSeason: true }));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(fixture.nativeElement.querySelector('.rankings-source')?.textContent).toContain(
      'Ranked by the SlapStat AI projection for the rest of the season',
    );
  });

  /** Back to the placeholder is back to nothing on screen, not the last league left standing. */
  it('clears the rankings when the league is unpicked', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    await choose(fixture, component, '');

    expect(component.rankingsData()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-league-projection-table')).toBeNull();
  });

  /** An account with no Yahoo behind it gets the connect button, not a dead dropdown. */
  it('offers to connect Yahoo where the account is not connected', async () => {
    connectionStatus.mockReturnValue(of({ connected: false }));
    listAll.mockReturnValue(of(boards));
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(component.picker.connected()).toBe(false);
    expect(myLeagues).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.picker-select')).toBeNull();
    expect(fixture.nativeElement.querySelector('.league-picker button')?.textContent).toContain(
      'Connect Yahoo account',
    );
  });

  /**
   * The point of the whole exercise: the totals are shown to everyone, and the players behind
   * them are not in the response at all without premium — so the table is told not to offer them.
   */
  it('shows the totals without the players, and sells the rest', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(component.hasPlayers()).toBe(false);
    expect(component.sellsPremium()).toBe(true);
    expect(component.leagueProjection()?.teams[0].total).toEqual(90);
  });

  it('offers the players when they came back', async () => {
    yahooLeague.mockReturnValue(of({ ...summary, premium: true }));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(component.hasPlayers()).toBe(true);
    expect(component.sellsPremium()).toBe(false);
  });

  /** Nothing is sold in a build with no way to buy it. */
  it('keeps quiet about premium where nothing can be bought', async () => {
    environment.paymentsEnabled = false;
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(component.sellsPremium()).toBe(false);
  });

  it('says a league has not drafted yet rather than showing every team at nothing', async () => {
    yahooLeague.mockReturnValue(of({ ...summary, picks: 0, status: 'PRE_DRAFT' as const }));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(component.notDrafted()).toBe(true);
    const notice = fixture.nativeElement.querySelector('.rankings-error');
    expect(notice?.textContent).toContain("hasn't drafted yet");
  });

  // Same sentence, same role, whichever side of the switch the build is on.
  it('says a league has not drafted yet through the shared notice when that is switched on', async () => {
    environment.sharedNoticeEnabled = true;
    yahooLeague.mockReturnValue(of({ ...summary, picks: 0, status: 'PRE_DRAFT' as const }));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    const notice = fixture.nativeElement.querySelector('app-notice');
    expect(notice?.textContent).toContain("hasn't drafted yet");
    expect(notice?.getAttribute('role')).toEqual('alert');
    expect(fixture.nativeElement.querySelector('.rankings-error')).toBeNull();
  });

  it('tells a reader what to do about a refusal from Yahoo', async () => {
    yahooLeague.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 424 })));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(component.rankingsMessage()).toContain('Yahoo refused');
    expect(component.rankingsRetryable()).toBe(true);
  });

  /**
   * A refusal from our own configuration used to read as "check your connection", which is the
   * one place the fault could not be. It is ours, and trying again says the same thing.
   */
  it('owns a refusal the reader cannot act on, and drops the button', async () => {
    yahooLeague.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(component.rankingsMessage()).toContain('technical problems');
    expect(component.rankingsRetryable()).toBe(false);
  });

  it('is not offered where the environment does not read a league draft', async () => {
    leagueDraftSync.mockReturnValue(false);
    const fixture = await render();

    expect(fixture.point.componentInstance.offered()).toBe(false);
    expect(connectionStatus).not.toHaveBeenCalled();
  });

  /** The second dropdown: ours first, then the reader's own boards, then the ones they follow. */
  it('offers the model, last season, and the boards the user owns and follows', async () => {
    const fixture = await render();
    const select = fixture.nativeElement.querySelector('.rank-by-select') as HTMLSelectElement;

    const options = Array.from(select.options).map((option) => option.textContent?.trim());
    expect(options).toEqual(['AI projection', 'Last season', 'My board', 'Their board']);
    const groups = Array.from(select.querySelectorAll('optgroup')).map((group) => group.label);
    expect(groups).toEqual(['SlapStat', 'My Projections', 'Following']);
    expect(select.value).toEqual('model');
  });

  it('ranks by last season by default where the AI projection is not served', async () => {
    aiProjection.mockReturnValue(false);
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(component.rankBy()).toEqual('last_season');
    expect(yahooLeague).toHaveBeenCalledWith('465.l.1', 'last_season');
    const select = fixture.nativeElement.querySelector('.rank-by-select') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).not.toContain('model');
  });

  /** Comparing one league under two projections is the point: no second button press. */
  it('re-reads the league on screen when another projection is chosen', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');
    yahooLeague.mockReturnValue(
      of({ ...summary, source: 'projection' as const, projectionId: 'b1', premium: true }),
    );

    const select = fixture.nativeElement.querySelector('.rank-by-select') as HTMLSelectElement;
    select.value = 'board:b1';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(yahooLeague).toHaveBeenLastCalledWith('465.l.1', 'board:b1');
    expect(component.rankedByLabel()).toEqual('My board');
    expect(component.hasPlayers()).toBe(true);
    expect(fixture.nativeElement.querySelector('.rankings-source')?.textContent).toContain(
      'Ranked by My board',
    );
  });

  it("says how many of the league's players a board leaves out", async () => {
    yahooLeague.mockReturnValue(
      of({ ...summary, source: 'projection' as const, projectionId: 'b1', unprojectedPlayers: 3 }),
    );
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(component.unprojectedPlayers()).toEqual(3);
    expect(fixture.nativeElement.querySelector('.rankings-gap')?.textContent).toContain(
      "3 players on this league's teams aren't",
    );
  });

  it('keeps our own projections on offer when the boards cannot be listed', async () => {
    listAll.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(component.boardsFailed()).toBe(true);
    const select = fixture.nativeElement.querySelector('.rank-by-select') as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
  });

  /** Picking a platform's tab, as a reader would. */
  const chooseTab = async (fixture: Awaited<ReturnType<typeof render>>, name: string) => {
    const root: HTMLElement = fixture.nativeElement;
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.provider-tab'));
    tabs.find((tab) => tab.textContent?.includes(name))?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const chooseEspn = (fixture: Awaited<ReturnType<typeof render>>) => chooseTab(fixture, 'ESPN');

  /** The ESPN card has checked the league with ESPN and hands it over. */
  const espnCardReads = async (fixture: Awaited<ReturnType<typeof render>>, leagueId: string) => {
    ngMocks.findInstance(EspnLeagueSyncComponent).synced.emit({
      leagueId,
      leagueName: 'Office League',
      settings: {} as never,
    });
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('offers Yahoo and ESPN tabs where ESPN leagues are offered, and no tabs where not', async () => {
    let fixture = await render();
    expect(fixture.nativeElement.querySelectorAll('.provider-tab')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).toBeNull();

    fixture.destroy();
    environment.espnLeaguesEnabled = false;
    fixture = await render();
    expect(fixture.nativeElement.querySelector('.provider-tab')).toBeNull();
    expect(fixture.nativeElement.querySelector('.league-select')).not.toBeNull();
  });

  /**
   * The ESPN tab shows the settings import's card in place of the league dropdown, and the league
   * it hands over is ranked by whatever the rank-by dropdown says.
   */
  it('ranks the ESPN league the card hands over, by the projection chosen', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;

    await chooseEspn(fixture);

    expect(fixture.nativeElement.querySelector('app-espn-league-sync')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.league-select')).toBeNull();
    expect(fixture.nativeElement.querySelector('.rank-by-select')).not.toBeNull();
    expect(espnCall).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.rankings-note')).toBeNull();

    await espnCardReads(fixture, '123456');

    expect(espnCall).toHaveBeenCalledWith('123456', 'model');
    expect(yahooLeague).not.toHaveBeenCalled();
    expect(component.leagueName()).toEqual('Office League');
    expect(fixture.nativeElement.querySelector('.rankings-league')?.textContent).toContain(
      'Office League',
    );

    const select = fixture.nativeElement.querySelector('.rank-by-select') as HTMLSelectElement;
    select.value = 'last_season';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(espnCall).toHaveBeenLastCalledWith('123456', 'last_season');
  });

  /** Each tab keeps its own league, so going back to Yahoo is going back to what was there. */
  it('keeps the Yahoo league for when the reader comes back to it', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');
    await chooseEspn(fixture);
    await espnCardReads(fixture, '123456');

    await chooseTab(fixture, 'Yahoo');

    expect(component.leagueName()).toEqual('Beer League');
    expect(yahooLeague).toHaveBeenLastCalledWith('465.l.1', 'model');
  });

  it("says ESPN's refusal of an ESPN league in ESPN's terms", async () => {
    espnCall.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await chooseEspn(fixture);
    await espnCardReads(fixture, '123456');

    expect(component.rankingsMessage()).toContain('ESPN has no league');
  });
});
