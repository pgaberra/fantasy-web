import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../api/api';
import { draftAnalysisEnabledGuard } from './draft-analysis-enabled.guard';

const HOME = { home: true };

function runGuard(invoke: () => Promise<unknown>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { createUrlTree: vi.fn().mockReturnValue(HOME) } },
      { provide: Api, useValue: { invoke } },
    ],
  });
  return firstValueFrom(
    TestBed.runInInjectionContext(
      () =>
        draftAnalysisEnabledGuard(
          {} as ActivatedRouteSnapshot,
          {} as RouterStateSnapshot,
        ) as Observable<unknown>,
    ),
  );
}

describe('draftAnalysisEnabledGuard', () => {
  it('lets the page open where the BFF serves Draft Analysis', async () => {
    expect(await runGuard(() => Promise.resolve({ draftAnalysis: true }))).toBe(true);
  });

  it('sends a direct hit home where it is off', async () => {
    expect(await runGuard(() => Promise.resolve({ draftAnalysis: false }))).toBe(HOME);
  });

  it('sends home when the features cannot be read', async () => {
    expect(await runGuard(() => Promise.reject(new Error('offline')))).toBe(HOME);
  });
});
