import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { LeagueSummaryComponent } from './league-summary';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { LeaguesResponse } from '../api/models/leagues-response';
import { FeatureService } from '../services/feature.service';
import { LeagueSummaryService } from '../services/league-summary.service';
import { YahooService } from '../services/yahoo.service';

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

describe('LeagueSummaryComponent', () => {
  const yahooLeague = vi.fn<(key: string) => Observable<LeagueSummaryResponse>>(() => of(summary));
  const myLeagues = vi.fn<() => Observable<LeaguesResponse>>(() => of(leagues));
  const leagueDraftSync = vi.fn(() => true);
  const originalPayments = environment.paymentsEnabled;

  const render = async () => {
    const fixture = MockRender(LeagueSummaryComponent);
    await fixture.whenStable();
    return fixture;
  };

  beforeEach(() => {
    environment.paymentsEnabled = true;
    yahooLeague.mockReset();
    yahooLeague.mockReturnValue(of(summary));
    myLeagues.mockReset();
    myLeagues.mockReturnValue(of(leagues));
    leagueDraftSync.mockReturnValue(true);
    return MockBuilder(LeagueSummaryComponent)
      .mock(YahooService, { myLeagues })
      .mock(LeagueSummaryService, { yahooLeague })
      .mock(FeatureService, { leagueDraftSync } as never);
  });

  afterEach(() => {
    environment.paymentsEnabled = originalPayments;
  });

  it('lists the leagues on the account and reads the one that is picked', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;

    expect(component.leagues()).toHaveLength(2);
    expect(yahooLeague).not.toHaveBeenCalled();

    component.choose('465.l.1');
    await fixture.whenStable();

    expect(yahooLeague).toHaveBeenCalledWith('465.l.1');
    expect(component.leagueName()).toEqual('Beer League');
    expect(component.leagueProjection()?.teams).toHaveLength(2);
    expect(component.scoreHeading()).toEqual('Total Points');
  });

  /**
   * The point of the whole exercise: the totals are shown to everyone, and the players behind
   * them are not in the response at all without premium — so the table is told not to offer them.
   */
  it('shows the totals without the players, and sells the rest', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    component.choose('465.l.1');
    await fixture.whenStable();

    expect(component.hasPlayers()).toBe(false);
    expect(component.sellsPremium()).toBe(true);
    expect(component.leagueProjection()?.teams[0].total).toEqual(90);
  });

  it('offers the players when they came back', async () => {
    yahooLeague.mockReturnValue(of({ ...summary, premium: true }));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    component.choose('465.l.1');
    await fixture.whenStable();

    expect(component.hasPlayers()).toBe(true);
    expect(component.sellsPremium()).toBe(false);
  });

  /** Nothing is sold in a build with no way to buy it. */
  it('keeps quiet about premium where nothing can be bought', async () => {
    environment.paymentsEnabled = false;
    const fixture = await render();
    const component = fixture.point.componentInstance;
    component.choose('465.l.1');
    await fixture.whenStable();

    expect(component.sellsPremium()).toBe(false);
  });

  it('says a league has not drafted yet rather than showing every team at nothing', async () => {
    yahooLeague.mockReturnValue(of({ ...summary, picks: 0, status: 'PRE_DRAFT' as const }));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    component.choose('465.l.1');
    await fixture.whenStable();

    expect(component.notDrafted()).toBe(true);
  });

  it('tells a reader what to do about a refusal from Yahoo', async () => {
    yahooLeague.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 424 })));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    component.choose('465.l.1');
    await fixture.whenStable();

    expect(component.summaryMessage()).toContain('Yahoo refused');
    expect(component.summaryRetryable()).toBe(true);
  });

  /**
   * A refusal from our own configuration used to read as "check your connection", which is the
   * one place the fault could not be. It is ours, and trying again says the same thing.
   */
  it('owns a refusal the reader cannot act on, and drops the button', async () => {
    yahooLeague.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const fixture = await render();
    const component = fixture.point.componentInstance;
    component.choose('465.l.1');
    await fixture.whenStable();

    expect(component.summaryMessage()).toContain('technical problems');
    expect(component.summaryRetryable()).toBe(false);
  });

  it('is not offered where the environment does not read a league draft', async () => {
    leagueDraftSync.mockReturnValue(false);
    const fixture = await render();

    expect(fixture.point.componentInstance.offered()).toBe(false);
  });

  /**
   * One way back rather than two: from a league the back link steps to the list, and only from
   * the list does it leave the page. A second "another league" button beside the title said the
   * same thing in a different place.
   */
  it('steps back to the list from a league, and out of the page from the list', async () => {
    const fixture = await render();
    const component = fixture.point.componentInstance;
    const host = fixture.point.nativeElement as HTMLElement;
    const back = () => host.querySelector('.back-link') as HTMLElement;

    expect(back().textContent).toContain('Back to drafts');

    component.choose('465.l.1');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(back().textContent).toContain('Back to leagues');
    expect([...host.querySelectorAll('button')].map((b) => b.textContent?.trim())).not.toContain(
      'Another league',
    );

    back().click();
    fixture.detectChanges();

    expect(component.leagueKey()).toBeNull();
    expect(back().textContent).toContain('Back to drafts');
  });
});
