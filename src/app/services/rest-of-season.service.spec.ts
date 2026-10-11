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
  const restOfSeasonPreset = signal(true);
  /** Stands in for FeatureService's own filtering: drops whatever a test says the BFF does not serve. */
  const unserved = signal<readonly string[]>([]);

  beforeEach(() => {
    invoke.mockReset();
    restOfSeasonPreset.set(true);
    unserved.set([]);
    return MockBuilder(RestOfSeasonService)
      .mock(Api, { invoke })
      .mock(FeatureService, {
        restOfSeasonPreset,
        offeredPresets: <T extends { readonly source?: string | null }>(presets: readonly T[]) =>
          presets.filter((preset) => !unserved().includes(preset.source ?? '')),
      });
  });

  const PRESETS = [
    { source: 'default' as const },
    { source: 'model' as const },
    { source: 'rest_of_season' as const },
  ];

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

  it('does not ask where the preset is switched off, and is not available', async () => {
    restOfSeasonPreset.set(false);

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

  describe('the presets it offers', () => {
    it('are every preset while a season is under way', async () => {
      invoke.mockResolvedValue({ available: true });
      const service = await answered();

      expect(service.offeredPresets(PRESETS).map((preset) => preset.source)).toEqual([
        'default',
        'model',
        'rest_of_season',
      ]);
    });

    it('leave the rest of the season out between seasons', async () => {
      invoke.mockResolvedValue({ available: false });
      const service = await answered();

      expect(service.offeredPresets(PRESETS).map((preset) => preset.source)).toEqual([
        'default',
        'model',
      ]);
    });

    it('are what the environment serves first, so nothing switched off comes back', async () => {
      invoke.mockResolvedValue({ available: true });
      unserved.set(['model', 'rest_of_season']);
      const service = await answered();

      expect(service.offeredPresets(PRESETS).map((preset) => preset.source)).toEqual(['default']);
    });
  });
});
