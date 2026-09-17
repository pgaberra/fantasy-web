import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MockBuilder } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureService } from './feature.service';
import { Api } from '../api/api';
import { getFeatures } from '../api/fn/features/get-features';

describe('FeatureService', () => {
  const invoke = vi.fn();
  const presets = [
    { source: 'default' as const },
    { source: 'model' as const },
    { source: 'blank' as const },
  ];

  beforeEach(() => {
    invoke.mockReset();
    return MockBuilder(FeatureService).mock(Api, { invoke });
  });

  const answered = async () => {
    const service = TestBed.inject(FeatureService);
    // Reading the signal is what starts the load; stability is when it has landed.
    service.aiProjection();
    await TestBed.inject(ApplicationRef).whenStable();
    return service;
  };

  it('offers nothing until the BFF has answered', () => {
    invoke.mockReturnValue(new Promise(() => undefined));

    const service = TestBed.inject(FeatureService);

    expect(service.aiProjection()).toEqual(false);
    expect(service.offeredPresets(presets).map((preset) => preset.source)).toEqual([
      'default',
      'blank',
    ]);
  });

  it('offers every preset where the BFF serves the AI projection', async () => {
    invoke.mockResolvedValue({ aiProjection: true });

    const service = await answered();

    expect(invoke).toHaveBeenCalledWith(getFeatures);
    expect(service.aiProjection()).toEqual(true);
    expect(service.offeredPresets(presets)).toEqual(presets);
  });

  it('drops the model preset where the BFF does not serve it', async () => {
    invoke.mockResolvedValue({ aiProjection: false });

    const service = await answered();

    expect(service.aiProjection()).toEqual(false);
    expect(service.offeredPresets(presets).map((preset) => preset.source)).toEqual([
      'default',
      'blank',
    ]);
  });

  it('offers feedback only where the BFF takes it', async () => {
    invoke.mockResolvedValue({ aiProjection: false, feedback: true });

    const service = await answered();

    expect(service.feedback()).toEqual(true);
  });

  it('does not offer feedback until the BFF has answered', () => {
    invoke.mockReturnValue(new Promise(() => undefined));

    expect(TestBed.inject(FeatureService).feedback()).toEqual(false);
  });

  // Offering a preset the server may not serve is the failure this service exists to prevent, so
  // not knowing counts as not served.
  it('does not offer the AI projection when the answer never arrives', async () => {
    invoke.mockRejectedValue(new Error('offline'));

    const service = await answered();

    expect(service.aiProjection()).toEqual(false);
  });
});
