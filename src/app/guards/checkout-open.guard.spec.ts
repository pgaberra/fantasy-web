import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkoutOpenGuard } from './checkout-open.guard';
import { environment } from '../../environments/environment';

function runGuard() {
  const createUrlTree = vi.fn().mockReturnValue({});
  TestBed.configureTestingModule({
    providers: [{ provide: Router, useValue: { createUrlTree } }],
  });
  const result = TestBed.runInInjectionContext(() =>
    checkoutOpenGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return { result, createUrlTree };
}

describe('checkoutOpenGuard', () => {
  const original = environment.premiumComingSoon;

  afterEach(() => {
    environment.premiumComingSoon = original;
  });

  it('allows navigation once subscriptions are open', () => {
    environment.premiumComingSoon = false;

    expect(runGuard().result).toEqual(true);
  });

  it('sends a checkout visit to the Premium page while Premium is coming soon', () => {
    environment.premiumComingSoon = true;

    const { result, createUrlTree } = runGuard();

    expect(createUrlTree).toHaveBeenCalledWith(['/premium']);
    expect(result).not.toEqual(true);
  });
});
