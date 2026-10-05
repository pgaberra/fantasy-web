import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

/**
 * `restored` is whether the page load's attempt to restore the session from the refresh cookie
 * finds one; it only matters to a visitor who starts out signed out.
 */
function runGuard(isLoggedIn: boolean, url = '/projections/abc123/draft', restored = false) {
  const createUrlTree = vi.fn().mockReturnValue({ login: true });
  let signedIn = isLoggedIn;
  let finishRestore!: () => void;
  const restoreSession = vi.fn().mockReturnValue(
    new Promise<void>((resolve) => {
      finishRestore = () => {
        signedIn ||= restored;
        resolve();
      };
    }),
  );
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { isLoggedIn: () => signedIn, restoreSession } },
      { provide: Router, useValue: { createUrlTree } },
    ],
  });
  const result = TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
  return { result, createUrlTree, restoreSession, finishRestore };
}

async function settled(run: ReturnType<typeof runGuard>) {
  run.finishRestore();
  return run.result;
}

describe('authGuard', () => {
  it('lets a signed-in visitor through without waiting on anything', () => {
    const run = runGuard(true);

    expect(run.result).toEqual(true);
    expect(run.restoreSession).not.toHaveBeenCalled();
  });

  /**
   * A guarded URL is one they typed, bookmarked or followed a link to. Sending them to the form
   * without it used to land everyone on their projections list, whatever they had asked for.
   */
  it('sends a signed-out visitor to sign in, with the page they wanted', async () => {
    const run = runGuard(false);

    expect(await settled(run)).toEqual({ login: true });
    expect(run.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/projections/abc123/draft' },
    });
  });

  it('keeps the query string on the page they wanted', async () => {
    const run = runGuard(false, '/whos-hot?range=10');

    await settled(run);

    expect(run.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/whos-hot?range=10' },
    });
  });

  /**
   * Safari wipes localStorage after seven days without a visit, but not the BFF's refresh cookie.
   * Deciding before the restore had answered sent every weekly visitor to the form.
   */
  it('waits for the session to be restored before deciding', async () => {
    const run = runGuard(false, '/draft', true);

    expect(run.createUrlTree).not.toHaveBeenCalled();
    expect(await settled(run)).toEqual(true);
    expect(run.createUrlTree).not.toHaveBeenCalled();
  });
});
