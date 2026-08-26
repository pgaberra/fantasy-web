import { describe, expect, it } from 'vitest';
import { Route } from '@angular/router';
import { routes } from './app.routes';
import { authGuard } from './guards/auth.guard';

describe('routes', () => {
  const routeFor = (path: string): Route => routes.find((route) => route.path === path)!;

  it('keeps the leaderboard behind a sign-in, since its splits are a signed-in endpoint', () => {
    // Unguarded, a signed-out visitor with the URL reached the page and was told the
    // leaderboard "couldn't load — check your connection" over what was really a 401.
    expect(routeFor('whos-hot').canActivate).toEqual([authGuard]);
  });

  it('leaves the pages that have to open for a stranger unguarded', () => {
    // A share link is the whole point of sharing, and consent has to be informed before
    // anyone has agreed to anything — neither may bounce a visitor to the login page.
    expect(routeFor('s/:token').canActivate).toBeUndefined();
    expect(routeFor('privacy').canActivate).toBeUndefined();
  });
});
