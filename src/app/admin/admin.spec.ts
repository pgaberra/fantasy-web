import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminComponent } from './admin';
import { AdminService } from '../services/admin.service';

describe('AdminComponent', () => {
  // Mutated by a test before MockRender to stand in for the query string the Yahoo callback
  // sends us back with.
  let queryParams: Record<string, string>;
  const yahooConnection = vi.fn();
  const connectYahoo = vi.fn();
  const triggerSync = vi.fn();
  const syncRuns = vi.fn();
  const probeYahooAccess = vi.fn();
  const yahooLeagues = vi.fn();

  beforeEach(() => {
    queryParams = {};
    yahooConnection.mockReturnValue(of({ connected: true }));
    connectYahoo.mockReturnValue(of({ authorizeUrl: 'https://example.com/consent' }));
    triggerSync.mockReturnValue(of({ status: 'accepted' }));
    syncRuns.mockReturnValue(of([]));
    probeYahooAccess.mockReturnValue(
      of({ ok: true, path: '/game/nhl/players', status: 200, players: 25 }),
    );
    yahooLeagues.mockReturnValue(of({ leagues: [] }));
    return MockBuilder(AdminComponent)
      .mock(AdminService, {
        yahooConnection,
        connectYahoo,
        triggerSync,
        syncRuns,
        probeYahooAccess,
        yahooLeagues,
      })
      .provide({ provide: ActivatedRoute, useValue: { snapshot: { queryParams } } });
  });

  /**
   * A connect round trip used to end in silence: whatever happened at Yahoo, you were dropped on
   * a page that said nothing about it. That is how a dead connection sat unnoticed for months.
   */
  describe('coming back from Yahoo', () => {
    it('says the connect worked', () => {
      queryParams['yahoo'] = 'connected';

      const fixture = MockRender(AdminComponent);

      expect(fixture.nativeElement.textContent).toContain('Yahoo account connected.');
    });

    /**
     * The distinction the whole banner exists for: Yahoo refusing the scope is not a mis-click,
     * and reading it as one sends you round the retry loop for nothing.
     */
    it("adds Yahoo's own word when it refused the scope", () => {
      queryParams['yahoo'] = 'error';
      queryParams['reason'] = 'declined';
      queryParams['detail'] = 'invalid_scope';

      const fixture = MockRender(AdminComponent);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Yahoo did not return an authorization code');
      expect(text).toContain('no longer allowed to ask for Fantasy Sports data');
    });

    it('ignores a detail it does not recognise', () => {
      queryParams['yahoo'] = 'error';
      queryParams['reason'] = 'declined';
      queryParams['detail'] = 'something-else';

      const fixture = MockRender(AdminComponent);

      expect(fixture.nativeElement.textContent).toContain(
        'Yahoo did not return an authorization code',
      );
    });

    it.each([
      {
        outcome: 'explains a refused code exchange instead of just saying it failed',
        reason: 'exchange_failed',
        phrase: 'Yahoo refused to exchange the code',
      },
      {
        outcome: 'tells you to retry without pausing when the link had expired',
        reason: 'invalid_state',
        phrase: 'had expired',
      },
      // A slug we do not recognise must still produce a sentence, not an empty banner.
      {
        outcome: 'falls back to plain words for an unknown reason',
        reason: 'something-we-have-not-seen',
        phrase: 'did not provide a reason',
      },
    ])('$outcome', ({ reason, phrase }) => {
      queryParams['yahoo'] = 'error';
      queryParams['reason'] = reason;

      const fixture = MockRender(AdminComponent);

      expect(fixture.nativeElement.textContent).toContain(phrase);
    });

    it('says nothing when we did not just come back from Yahoo', () => {
      const fixture = MockRender(AdminComponent);

      expect(fixture.nativeElement.textContent).not.toContain('Yahoo account connected.');
    });
  });

  it('shows the connected status from the service', () => {
    const fixture = MockRender(AdminComponent);

    expect(fixture.nativeElement.textContent).toContain('Connected');
  });

  it('triggers a sync when the sync button is clicked', () => {
    const fixture = MockRender(AdminComponent);

    ngMocks.find<HTMLButtonElement>('.btn-secondary').nativeElement.click();
    fixture.detectChanges();

    expect(triggerSync).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Sync started');
  });

  /**
   * The probe exists to make a refusal readable, so a refusal is a result and not an error —
   * showing "could not reach the probe" over Yahoo's own 403 would waste the whole feature.
   */
  describe('the Yahoo access probe', () => {
    const runProbe = (fixture: ReturnType<typeof MockRender<AdminComponent>>) => {
      const component = fixture.point.componentInstance;
      component.runProbe();
      fixture.detectChanges();
    };

    it('shows what Yahoo refused, in its own words', () => {
      probeYahooAccess.mockReturnValue(
        of({
          ok: false,
          path: '/game/nhl/players;start=0;count=25/stats;type=season;season=2026',
          status: 403,
          error: 'This application is not authorized to perform this action.',
        }),
      );
      const fixture = MockRender(AdminComponent);

      runProbe(fixture);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Refused');
      expect(text).toContain('HTTP 403');
      expect(text).toContain('This application is not authorized to perform this action.');
      expect(text).toContain('season=2026');
      expect(text).not.toContain('Could not reach the probe');
    });

    it('shows how many players came back when Yahoo served it', () => {
      const fixture = MockRender(AdminComponent);

      runProbe(fixture);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Yahoo served it');
      expect(text).toContain('25 players');
    });

    it('sends no season filter when the season is left empty', () => {
      const fixture = MockRender(AdminComponent);

      runProbe(fixture);

      expect(probeYahooAccess).toHaveBeenCalledWith('nhl', undefined, undefined, undefined);
    });

    /**
     * The question the league mode exists to ask: is a league served where a whole game is
     * refused? It only gets asked if the key actually reaches the call.
     */
    it('asks about a league when a league key is given', () => {
      const fixture = MockRender(AdminComponent);
      fixture.point.componentInstance.probeLeagueKey.set('465.l.12345');

      fixture.point.componentInstance.runProbe();
      fixture.detectChanges();

      expect(probeYahooAccess).toHaveBeenCalledWith('nhl', undefined, '465.l.12345', undefined);
    });

    /**
     * The floor question has to be askable from the page, or it does not get asked: everything we
     * knew until now came from a call that threw and hid Yahoo's answer.
     */
    it('asks whether the account can list its own leagues', () => {
      const fixture = MockRender(AdminComponent);

      fixture.point.componentInstance.runLeaguesProbe();
      fixture.detectChanges();

      expect(probeYahooAccess).toHaveBeenCalledWith('nhl', undefined, undefined, 'leagues');
    });

    it('offers the service account league keys to fill it in', () => {
      yahooLeagues.mockReturnValue(
        of({ leagues: [{ leagueKey: '465.l.999', name: 'Test League', season: 2026 }] }),
      );
      const fixture = MockRender(AdminComponent);

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('465.l.999');
      expect(text).toContain('Test League');
    });

    /**
     * "Connected" while every call is refused is the state that looked like our bug for weeks:
     * the page has to say that Yahoo said no, in Yahoo's words.
     */
    it("shows Yahoo's own refusal when it will not list the leagues", () => {
      yahooLeagues.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 424,
              error: {
                code: 'YAHOO_ACCESS_DENIED',
                message:
                  'Yahoo refused the request: This application is not authorized to perform this action.',
              },
            }),
        ),
      );
      const fixture = MockRender(AdminComponent);

      expect(fixture.nativeElement.textContent).toContain(
        'Yahoo refused the request: This application is not authorized to perform this action.',
      );
    });

    it('keeps the generic line when listing the leagues fails for another reason', () => {
      yahooLeagues.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502 })));
      const fixture = MockRender(AdminComponent);

      expect(fixture.nativeElement.textContent).toContain(
        "Yahoo would not list the service account's leagues.",
      );
    });

    it('falls back to nhl when the game key is blanked out', () => {
      const fixture = MockRender(AdminComponent);
      fixture.point.componentInstance.probeGameKey.set('   ');

      runProbe(fixture);

      expect(probeYahooAccess).toHaveBeenCalledWith('nhl', undefined, undefined, undefined);
    });
  });
});
