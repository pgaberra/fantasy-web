import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paymentsEnabledGuard } from './payments-enabled.guard';
import { environment } from '../../environments/environment';

function runGuard() {
  const createUrlTree = vi.fn().mockReturnValue({});
  TestBed.configureTestingModule({
    providers: [{ provide: Router, useValue: { createUrlTree } }],
  });
  const result = TestBed.runInInjectionContext(() =>
    paymentsEnabledGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return { result, createUrlTree };
}

describe('paymentsEnabledGuard', () => {
  const original = environment.paymentsEnabled;

  afterEach(() => {
    environment.paymentsEnabled = original;
  });

  it('allows navigation when payments are enabled', () => {
    environment.paymentsEnabled = true;

    expect(runGuard().result).toEqual(true);
  });

  it('redirects home when payments are disabled', () => {
    environment.paymentsEnabled = false;

    const { result, createUrlTree } = runGuard();

    expect(createUrlTree).toHaveBeenCalledWith(['/']);
    expect(result).not.toEqual(true);
  });
});
