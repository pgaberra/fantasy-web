import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { TeamPowerRankingsComponent } from './team-power-rankings';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { LeaguesResponse } from '../api/models/leagues-response';
import { FeatureService } from '../services/feature.service';
import { LeagueSummaryService } from '../services/league-summary.service';
import { YahooService } from '../services/yahoo.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';

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
  categoryKeys: ['goals'],
  positionKeys: ['C', 'BN'],
  teams: [
    { teamId: 't1', name: 'Mine', mine: true, total: 90, values: { goals: 90, C: 90, BN: 0 } },
    { teamId: 't2', name: 'Theirs', mine: false, total: 70, values: { goals: 70, C: 70, BN: 0 } },
  ],
};

describe('TeamPowerRankingsComponent', () => {
  const yahooLeague = vi.fn<(key: string) => Observable<LeagueSummaryResponse>>(() => of(summary));
  const myLeagues = vi.fn<() => Observable<LeaguesResponse>>(() => of(leagues));
  const connectionStatus = vi.fn<() => Observable<{ connected: boolean }>>(() =>
    of({ connected: true }),
  );
  const leagueDraftSync = vi.fn(() => true);
  const originalPayments = environment.paymentsEnabled;

  const render = async () => {
    const fixture = MockRender(TeamPowerRankingsComponent);
    await fixture.whenStable();
    return fixture;
  };

  /** Picking a league in the dropdown and pressing the button, as a reader would. */
  const choose = async (
    fixture: Awaited<ReturnType<typeof render>>,
    component: TeamPowerRankingsComponent,
    leagueKey: string,
  ) => {
    const select = fixture.nativeElement.querySelector('.picker-select') as HTMLSelectElement;
    select.value = leagueKey;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    component.show();
    await fixture.whenStable();
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
    return MockBuilder(TeamPowerRankingsComponent)
      .keep(YahooLeaguePicker)
      .mock(YahooService, {
        myLeagues,
        connectionStatus,
        startConnect: () => of({ authorizeUrl: 'https://example.test/auth' }),
      } as never)
      .mock(YahooConnectReturnService)
      .mock(LeagueSummaryService, { yahooLeague })
      .mock(FeatureService, { leagueDraftSync } as never);
  });

  afterEach(() => {
    environment.paymentsEnabled = originalPayments;
  });

  /**
   * The league is chosen the way draft setup chooses one: a dropdown of the account's leagues and
   * a button. Nothing is read until the button is pressed — the leagues load on their own, the
   * league does not.
   */
  it('offers the leagues on the account in a dropdown and reads the one picked', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(component.picker.leagues()).toHaveLength(2);
    expect(component.picker.selectedKey()).toBeNull();
    expect(yahooLeague).not.toHaveBeenCalled();

    await choose(fixture, component, '465.l.1');

    expect(yahooLeague).toHaveBeenCalledWith('465.l.1');
    expect(component.leagueName()).toEqual('Beer League');
    expect(component.leagueProjection()?.teams).toHaveLength(2);
    expect(component.scoreHeading()).toEqual('Total Points');
  });

  /** The dropdown stays: a second league is picked from it, not from a trip back to a list. */
  it('reads another league without leaving the one on screen', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    await choose(fixture, component, '465.l.1');

    expect(component.canShow()).toBe(false);

    await choose(fixture, component, '465.l.2');

    expect(yahooLeague).toHaveBeenLastCalledWith('465.l.2');
    expect(component.leagueName()).toEqual('Work League');
  });

  /** An account with no Yahoo behind it gets the connect button, not a dead dropdown. */
  it('offers to connect Yahoo where the account is not connected', async () => {
    connectionStatus.mockReturnValue(of({ connected: false }));
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(component.picker.connected()).toBe(false);
    expect(myLeagues).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.picker-select')).toBeNull();
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
});
