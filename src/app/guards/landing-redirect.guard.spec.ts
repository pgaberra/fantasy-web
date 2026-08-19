import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { landingRedirectGuard } from './landing-redirect.guard';
import { AuthService } from '../services/auth.service';

function runGuard(queryParams: Record<string, string>, loggedIn = true, admin = true) {
  const createUrlTree = vi.fn().mockReturnValue({});
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: { isLoggedIn: () => loggedIn, isAdmin: () => admin },
      },
      { provide: Router, useValue: { createUrlTree } },
    ],
  });
  const result = TestBed.runInInjectionContext(() =>
    landingRedirectGuard({ queryParams } as unknown as ActivatedRouteSnapshot, {} as never),
  );
  return { result, createUrlTree };
}

describe('landingRedirectGuard', () => {
  it('shows the landing page to a visitor who is not signed in', () => {
    expect(runGuard({}, false).result).toEqual(true);
  });

  it('sends a signed-in user to projections', () => {
    expect(runGuard({}).createUrlTree).toHaveBeenCalledWith(['/projections']);
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

  it('sends a non-admin to projections even after a connect', () => {
    expect(runGuard({ yahoo: 'connected' }, true, false).createUrlTree).toHaveBeenCalledWith([
      '/projections',
    ]);
  });
});
