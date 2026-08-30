import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { whosHotEnabledGuard } from './whos-hot-enabled.guard';
import { environment } from '../../environments/environment';

function runGuard() {
  const createUrlTree = vi.fn().mockReturnValue({});
  TestBed.configureTestingModule({
    providers: [{ provide: Router, useValue: { createUrlTree } }],
  });
  const result = TestBed.runInInjectionContext(() =>
    whosHotEnabledGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return { result, createUrlTree };
}

describe('whosHotEnabledGuard', () => {
  const original = environment.whosHotEnabled;

  afterEach(() => {
    environment.whosHotEnabled = original;
  });

  it('allows navigation when the page is enabled', () => {
    environment.whosHotEnabled = true;

    expect(runGuard().result).toEqual(true);
  });

  it('redirects home when the page is disabled', () => {
    environment.whosHotEnabled = false;

    const { result, createUrlTree } = runGuard();

    expect(createUrlTree).toHaveBeenCalledWith(['/']);
    expect(result).not.toEqual(true);
  });
});
