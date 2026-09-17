import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RedirectFunction, Route, UrlTree } from '@angular/router';
import { routes } from './app.routes';
import { authGuard } from './guards/auth.guard';
import { whosHotEnabledGuard } from './guards/whos-hot-enabled.guard';

describe('routes', () => {
  const routeFor = (path: string): Route => routes.find((route) => route.path === path)!;

  it('keeps the leaderboard behind a sign-in, since its splits are a signed-in endpoint', () => {
    // Unguarded, a signed-out visitor with the URL reached the page and was told the
    // leaderboard "couldn't load — check your connection" over what was really a 401.
    expect(routeFor('whos-hot').canActivate).toEqual([whosHotEnabledGuard, authGuard]);
  });

  it('leaves the pages that have to open for a stranger unguarded', () => {
    // A share link is the whole point of sharing, and consent has to be informed before
    // anyone has agreed to anything — neither may bounce a visitor to the login page.
    expect(routeFor('s/:token').canActivate).toBeUndefined();
    expect(routeFor('privacy').canActivate).toBeUndefined();
    // A payment provider reviews the terms and the refund policy from a signed-out browser, and a customer
    // has to be able to read both before paying.
    expect(routeFor('terms').canActivate).toBeUndefined();
    expect(routeFor('refunds').canActivate).toBeUndefined();
  });

  /**
   * The plans and the subscription on them are one page now, and a finished checkout returns to
   * whatever URL it was given when it was created, which for anything already in flight is the
   * old one. So /pricing and /account still have to arrive
   * here, and arrive carrying ?checkout=success: without it the page greets a new subscriber
   * as a visitor and offers them a second checkout.
   */
  it('keeps the old payment addresses pointed here, query string and all', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    for (const path of ['pricing', 'account']) {
      const route = routeFor(path);
      expect(route.pathMatch).toEqual('full');
      const redirect = route.redirectTo as RedirectFunction;
      const target = TestBed.runInInjectionContext(() =>
        redirect({
          queryParams: { checkout: 'success' },
        } as unknown as Parameters<RedirectFunction>[0]),
      );

      expect((target as UrlTree).toString()).toEqual('/premium?checkout=success');
    }
  });

  it('catches an unknown address instead of letting the router throw', () => {
    // NG04002 reached Sentry as an application error and the visitor saw an empty page.
    // It has to be last: a wildcard earlier in the list would swallow every route after it.
    expect(routes.at(-1)?.path).toEqual('**');
    expect(routeFor('**').canActivate).toBeUndefined();
  });
});
