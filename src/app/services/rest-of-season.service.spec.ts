import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RestOfSeasonService } from './rest-of-season.service';
import { FeatureService } from './feature.service';
import { Api } from '../api/api';
import { restOfSeasonStatus } from '../api/fn/projection-model/rest-of-season-status';

describe('RestOfSeasonService', () => {
  const invoke = vi.fn();
  const aiProjection = signal(true);

  beforeEach(() => {
    invoke.mockReset();
    aiProjection.set(true);
    return MockBuilder(RestOfSeasonService)
      .mock(Api, { invoke })
      .mock(FeatureService, { aiProjection });
  });

  const answered = async () => {
    const service = TestBed.inject(RestOfSeasonService);
    service.available();
    await TestBed.inject(ApplicationRef).whenStable();
    return service;
  };

  it('is available while the BFF says a season is under way', async () => {
    invoke.mockResolvedValue({ available: true });

    const service = await answered();

    expect(invoke).toHaveBeenCalledWith(restOfSeasonStatus);
    expect(service.available()).toBe(true);
  });

  it('is not available between seasons', async () => {
    invoke.mockResolvedValue({ available: false });

    expect((await answered()).available()).toBe(false);
  });

  it('does not ask where the AI projection is not served, and is not available', async () => {
    aiProjection.set(false);

    const service = await answered();

    expect(invoke).not.toHaveBeenCalled();
    expect(service.available()).toBe(false);
  });

  it('is not available while the BFF has yet to answer', () => {
    invoke.mockReturnValue(new Promise(() => undefined));

    expect(TestBed.inject(RestOfSeasonService).available()).toBe(false);
  });

  it('is not available when the read fails', async () => {
    invoke.mockRejectedValue(new Error('down'));

    expect((await answered()).available()).toBe(false);
  });
});
