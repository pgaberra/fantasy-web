import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

function runGuard(isLoggedIn: boolean, url = '/projections/abc123/draft') {
  const createUrlTree = vi.fn().mockReturnValue({});
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { isLoggedIn: () => isLoggedIn } },
      { provide: Router, useValue: { createUrlTree } },
    ],
  });
  const result = TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
  return { result, createUrlTree };
}

describe('authGuard', () => {
  it('lets a signed-in visitor through', () => {
    expect(runGuard(true).result).toEqual(true);
  });

  /**
   * A guarded URL is one they typed, bookmarked or followed a link to. Sending them to the form
   * without it used to land everyone on their projections list, whatever they had asked for.
   */
  it('sends a signed-out visitor to sign in, with the page they wanted', () => {
    const { result, createUrlTree } = runGuard(false);

    expect(createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/projections/abc123/draft' },
    });
    expect(result).not.toEqual(true);
  });

  it('keeps the query string on the page they wanted', () => {
    const { createUrlTree } = runGuard(false, '/whos-hot?range=10');

    expect(createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/whos-hot?range=10' },
    });
  });
});
