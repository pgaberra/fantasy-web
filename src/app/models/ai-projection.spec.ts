import { afterEach, describe, expect, it } from 'vitest';
import { isAiProjectionEnabled, offeredPresets } from './ai-projection';
import { environment } from '../../environments/environment';

describe('offeredPresets', () => {
  const original = environment.aiProjectionEnabled;
  const presets = [
    { source: 'default' as const },
    { source: 'model' as const },
    { source: 'blank' as const },
  ];

  afterEach(() => {
    environment.aiProjectionEnabled = original;
  });

  it('offers every preset while the AI projection is on', () => {
    environment.aiProjectionEnabled = true;

    expect(isAiProjectionEnabled()).toEqual(true);
    expect(offeredPresets(presets)).toEqual(presets);
  });

  it('drops the model preset when the AI projection is off', () => {
    environment.aiProjectionEnabled = false;

    expect(isAiProjectionEnabled()).toEqual(false);
    expect(offeredPresets(presets).map((preset) => preset.source)).toEqual(['default', 'blank']);
  });
});
