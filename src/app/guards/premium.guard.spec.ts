import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { premiumGuard } from './premium.guard';
import { EntitlementService } from '../services/entitlement.service';

function runGuard(premium: boolean) {
  const createUrlTree = vi.fn().mockReturnValue({});
  TestBed.configureTestingModule({
    providers: [
      { provide: EntitlementService, useValue: { premium: () => premium } },
      { provide: Router, useValue: { createUrlTree } },
    ],
  });
  const result = TestBed.runInInjectionContext(() =>
    premiumGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return { result, createUrlTree };
}

describe('premiumGuard', () => {
  it('allows a premium user', () => {
    expect(runGuard(true).result).toEqual(true);
  });

  it('redirects a non-premium user to pricing', () => {
    const { result, createUrlTree } = runGuard(false);

    expect(createUrlTree).toHaveBeenCalledWith(['/pricing']);
    expect(result).not.toEqual(true);
  });
});
