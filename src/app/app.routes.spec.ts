import { describe, expect, it } from 'vitest';
import { Route } from '@angular/router';
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
  });

  it('catches an unknown address instead of letting the router throw', () => {
    // NG04002 reached Sentry as an application error and the visitor saw an empty page.
    // It has to be last: a wildcard earlier in the list would swallow every route after it.
    expect(routes.at(-1)?.path).toEqual('**');
    expect(routeFor('**').canActivate).toBeUndefined();
  });
});
