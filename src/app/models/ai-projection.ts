import { environment } from '../../environments/environment';
import { CreateProjectionRequest } from '../api/models/create-projection-request';

/** What a preset seeded from the projection model asks the server for. */
export const MODEL_PRESET_SOURCE = 'model';

/**
 * Whether this build offers the AI projection at all.
 *
 * <p>Read through a function rather than captured at module load, so the pages that ask decide
 * when they are built rather than when the bundle is parsed.
 */
export function isAiProjectionEnabled(): boolean {
  return environment.aiProjectionEnabled;
}

/**
 * The presets a build actually offers. Every one of them when the AI projection is on, and
 * everything but the model-seeded one when it is off — a build without the model must not offer
 * a starting point it cannot fill in, on any page that lists presets.
 */
export function offeredPresets<T extends { readonly source: CreateProjectionRequest['source'] }>(
  presets: readonly T[],
): readonly T[] {
  return isAiProjectionEnabled()
    ? presets
    : presets.filter((preset) => preset.source !== MODEL_PRESET_SOURCE);
}
