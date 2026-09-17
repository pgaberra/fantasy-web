import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { landingRedirectGuard } from './landing-redirect.guard';
import { AdminService } from '../services/admin.service';
import { AuthService } from '../services/auth.service';
import { YahooService } from '../services/yahoo.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';

function runGuard(
  queryParams: Record<string, string>,
  loggedIn = true,
  admin = true,
  fragment: string | null = null,
  claimResult: Observable<unknown> = of({ connected: true }),
  startedFrom: string | null = null,
) {
  const createUrlTree = vi.fn().mockImplementation((commands, extras) => ({ commands, extras }));
  const parseUrl = vi.fn().mockImplementation((url: string) => ({ parsed: url }));
  const take = vi.fn().mockReturnValue(startedFrom);
  const completeConnect = vi.fn().mockReturnValue(claimResult);
  const completeYahooConnect = vi.fn().mockReturnValue(claimResult);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: { isLoggedIn: () => loggedIn, isAdmin: () => admin },
      },
      { provide: Router, useValue: { createUrlTree, parseUrl } },
      { provide: YahooConnectReturnService, useValue: { take } },
      { provide: YahooService, useValue: { completeConnect } },
      { provide: AdminService, useValue: { completeYahooConnect } },
    ],
  });
  const result = TestBed.runInInjectionContext(() =>
    landingRedirectGuard(
      { queryParams, fragment } as unknown as ActivatedRouteSnapshot,
      {} as never,
    ),
  );
  return { result, createUrlTree, parseUrl, take, completeConnect, completeYahooConnect };
}

async function landing(result: unknown) {
  return firstValueFrom(result as Observable<unknown>);
}

describe('landingRedirectGuard', () => {
  it('shows the landing page to a visitor who is not signed in', () => {
    expect(runGuard({}, false).result).toEqual(true);
  });

  it('sends a signed-in user home', () => {
    expect(runGuard({}).createUrlTree).toHaveBeenCalledWith(['/home']);
  });

  it('sends an admin back to admin after a successful connect', () => {
    expect(runGuard({ yahoo: 'connected' }).createUrlTree).toHaveBeenCalledWith(['/admin'], {
      queryParams: { yahoo: 'connected' },
    });
  });

  /**
   * The case this guard was missing: a failed connect fell through to projections and said
   * nothing, so a reconnect that silently did not happen looked exactly like one that did.
   */
  it('sends an admin back to admin after a failed connect, with the reason', () => {
    expect(
      runGuard({ yahoo: 'error', reason: 'exchange_failed' }).createUrlTree,
    ).toHaveBeenCalledWith(['/admin'], {
      queryParams: { yahoo: 'error', reason: 'exchange_failed' },
    });
  });

  it('leaves the reason out when the callback did not give one', () => {
    expect(runGuard({ yahoo: 'error' }).createUrlTree).toHaveBeenCalledWith(['/admin'], {
      queryParams: { yahoo: 'error' },
    });
  });

  /**
   * Yahoo's own error code rides along in `detail`, and naming params one by one dropped it on
   * the floor -- the card could never show the one thing we built it to show.
   */
  it("carries Yahoo's own error code through as well", () => {
    expect(
      runGuard({ yahoo: 'error', reason: 'declined', detail: 'invalid_scope' }).createUrlTree,
    ).toHaveBeenCalledWith(['/admin'], {
      queryParams: { yahoo: 'error', reason: 'declined', detail: 'invalid_scope' },
    });
  });

  /**
   * The callback no longer connects anything: it parks the tokens and hands this page a one-time
   * code, and only a signed-in claim attaches them, to the account that started the connect.
   */
  describe('claiming a Yahoo connection', () => {
    it("claims the user's own connect and goes to home", async () => {
      const run = runGuard({ yahoo: 'confirm', account: 'user' }, true, false, 'link=the-code');

      expect(await landing(run.result)).toEqual({
        commands: ['/home'],
        extras: { queryParams: { yahoo: 'connected' } },
      });
      expect(run.completeConnect).toHaveBeenCalledWith('the-code');
      expect(run.completeYahooConnect).not.toHaveBeenCalled();
    });

    it('claims a service-account connect as an admin and goes back to admin', async () => {
      const run = runGuard({ yahoo: 'confirm', account: 'service' }, true, true, 'link=the-code');

      expect(await landing(run.result)).toEqual({
        commands: ['/admin'],
        extras: { queryParams: { yahoo: 'connected' } },
      });
      expect(run.completeYahooConnect).toHaveBeenCalledWith('the-code');
      expect(run.completeConnect).not.toHaveBeenCalled();
    });

    /** Someone else's consent link, finished in this browser: said plainly, never connected. */
    it('reports a connect another account started', async () => {
      const run = runGuard(
        { yahoo: 'confirm', account: 'service' },
        true,
        true,
        'link=the-code',
        throwError(() => new HttpErrorResponse({ status: 409 })),
      );

      expect(await landing(run.result)).toEqual({
        commands: ['/admin'],
        extras: { queryParams: { yahoo: 'error', reason: 'wrong_account' } },
      });
    });

    it.each([
      { status: 404, reason: 'link_expired' },
      { status: 502, reason: 'claim_failed' },
    ])('reports a $status as $reason', async ({ status, reason }) => {
      const run = runGuard(
        { yahoo: 'confirm', account: 'service' },
        true,
        true,
        'link=the-code',
        throwError(() => new HttpErrorResponse({ status })),
      );

      expect(await landing(run.result)).toEqual({
        commands: ['/admin'],
        extras: { queryParams: { yahoo: 'error', reason } },
      });
    });

    it('claims nothing without a code', async () => {
      const run = runGuard({ yahoo: 'confirm', account: 'user' }, true, false, null);

      expect(await landing(run.result)).toEqual({
        commands: ['/home'],
        extras: { queryParams: { yahoo: 'error', reason: 'claim_failed' } },
      });
      expect(run.completeConnect).not.toHaveBeenCalled();
    });

    it('claims nothing for a visitor who is not signed in, and drops the code from the URL', () => {
      const run = runGuard({ yahoo: 'confirm', account: 'user' }, false, false, 'link=the-code');

      expect(run.createUrlTree).toHaveBeenCalledWith(['/']);
      expect(run.completeConnect).not.toHaveBeenCalled();
    });
  });

  /**
   * The connect button sits on the draft, editor and Who's hot pages; ending every connect on
   * projections dropped the user off the page they were working on.
   */
  describe('returning to the page a connect started from', () => {
    it("brings a user's claimed connect back to that page, path and query as they were", async () => {
      const run = runGuard(
        { yahoo: 'confirm', account: 'user' },
        true,
        false,
        'link=the-code',
        of({ connected: true }),
        '/draft/new/standard?source=model',
      );

      expect(await landing(run.result)).toEqual({ parsed: '/draft/new/standard?source=model' });
      expect(run.completeConnect).toHaveBeenCalledWith('the-code');
    });

    it('brings a failed claim back to that page too, where the connect button waits', async () => {
      const run = runGuard(
        { yahoo: 'confirm', account: 'user' },
        true,
        false,
        'link=the-code',
        throwError(() => new HttpErrorResponse({ status: 404 })),
        '/whos-hot',
      );

      expect(await landing(run.result)).toEqual({ parsed: '/whos-hot' });
    });

    it('does so for an admin connecting their own account', async () => {
      const run = runGuard(
        { yahoo: 'confirm', account: 'user' },
        true,
        true,
        'link=the-code',
        of({ connected: true }),
        '/projections/42',
      );

      expect(await landing(run.result)).toEqual({ parsed: '/projections/42' });
    });

    it('keeps a service-account connect on the admin panel, and spends the remembered page', async () => {
      const run = runGuard(
        { yahoo: 'confirm', account: 'service' },
        true,
        true,
        'link=the-code',
        of({ connected: true }),
        '/whos-hot',
      );

      expect(await landing(run.result)).toEqual({
        commands: ['/admin'],
        extras: { queryParams: { yahoo: 'connected' } },
      });
      expect(run.take).toHaveBeenCalled();
    });

    it('brings a consent Yahoo did not complete back to that page', () => {
      const run = runGuard(
        { yahoo: 'error', reason: 'declined' },
        true,
        true,
        null,
        of({ connected: true }),
        '/draft',
      );

      expect(run.result).toEqual({ parsed: '/draft' });
    });

    it('falls back to home when the router cannot read the page', async () => {
      const run = runGuard(
        { yahoo: 'confirm', account: 'user' },
        true,
        false,
        'link=the-code',
        of({ connected: true }),
        '/draft',
      );
      run.parseUrl.mockImplementation(() => {
        throw new Error('malformed');
      });

      expect(await landing(run.result)).toEqual({
        commands: ['/home'],
        extras: { queryParams: { yahoo: 'connected' } },
      });
    });
  });

  it('sends a non-admin home even after a connect', () => {
    expect(runGuard({ yahoo: 'connected' }, true, false).createUrlTree).toHaveBeenCalledWith([
      '/home',
    ]);
  });
});
