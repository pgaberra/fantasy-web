import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { demoRedemptionGuard } from './demo-redemption.guard';
import { PendingProjectionService } from '../services/pending-projection.service';
import { ProjectionData } from '../api/models/projection-data';

function runGuard(pending: ProjectionData | null) {
  const createUrlTree = vi.fn().mockImplementation((commands) => ({ commands }));
  TestBed.configureTestingModule({
    providers: [
      { provide: PendingProjectionService, useValue: { peek: () => pending } },
      { provide: Router, useValue: { createUrlTree } },
    ],
  });
  const result = TestBed.runInInjectionContext(() => demoRedemptionGuard({} as never, {} as never));
  return { result, createUrlTree };
}

describe('demoRedemptionGuard', () => {
  it('lets a user with nothing waiting reach home', () => {
    expect(runGuard(null).result).toEqual(true);
  });

  it('sends a user with demo work waiting to the list that saves it', () => {
    const pending = { settings: {} } as unknown as ProjectionData;
    expect(runGuard(pending).result).toEqual({ commands: ['/projections'] });
  });
});
