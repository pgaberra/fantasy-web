import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
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

describe('TeamPowerRankingsComponent', () => {
  const yahooLeague = vi.fn<(key: string, rankBy?: RankBy) => Observable<LeagueSummaryResponse>>(
    () => of(summary),
  );
  const listEditable = vi.fn<() => Observable<ProjectionSummaryResponse[]>>(() => of(boards));
  const aiProjection = vi.fn(() => true);
  const myLeagues = vi.fn<() => Observable<LeaguesResponse>>(() => of(leagues));
  const connectionStatus = vi.fn<() => Observable<{ connected: boolean }>>(() =>
    of({ connected: true }),
  );
  const leagueDraftSync = vi.fn(() => true);
  const originalPayments = environment.paymentsEnabled;
  const originalSharedNotice = environment.sharedNoticeEnabled;

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
    listEditable.mockReset();
    listEditable.mockReturnValue(of(boards));
    return MockBuilder(TeamPowerRankingsComponent)
      .keep(YahooLeaguePicker)
      .mock(YahooService, {
        myLeagues,
        connectionStatus,
        startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
      } as never)
      .mock(YahooConnectReturnService)
      .mock(LeagueSummaryService, { yahooLeague })
      .mock(ProjectionStorageService, { listEditable })
      .mock(FeatureService, { leagueDraftSync, aiProjection } as never);
  });

  afterEach(() => {
    environment.paymentsEnabled = originalPayments;
    environment.sharedNoticeEnabled = originalSharedNotice;
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
    expect(options).toEqual(['SlapStat AI projection', 'Last season', 'My board', 'Their board']);
    const groups = Array.from(select.querySelectorAll('optgroup')).map((group) => group.label);
    expect(groups).toEqual(['My projections', 'Following']);
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
    listEditable.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(component.boardsFailed()).toBe(true);
    const select = fixture.nativeElement.querySelector('.rank-by-select') as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
  });
});
