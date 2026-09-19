import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';

/**
 * The name the preset draft is stored under. It doubles as the label on the board, so the
 * heading there reads the same as the row the draft was started from.
 */
export const LAST_SEASON_PRESET_NAME = "Last Season's Stats";

/** The model's own estimate for the coming season. Named by the server, like the other preset. */
export const MODEL_PRESET_NAME = 'AI Projection';

/**
 * A starting point everyone shares, as opposed to a projection someone owns.
 *
 * <p>`id` is what a draft started from a preset carries, so the page can name what it was
 * played against without reading it back out of the draft's own name — which the user, or a
 * league sync, may since have changed.
 */
export interface Preset {
  readonly id: NonNullable<ProjectionSummaryResponse['preset']>;
  readonly name: string;
  readonly source: CreateProjectionRequest['source'];
  /**
   * Sold as part of Premium. It marks the card and nothing else — see `showsPremiumBadge` for
   * why the mark is not shown in a build that has no way to charge for it.
   */
  readonly premium?: boolean;
}

/** Every preset the picker knows of. What the draft start page offers is its `availablePresets`. */
export const PRESETS: readonly Preset[] = [
  { id: 'last_season', name: LAST_SEASON_PRESET_NAME, source: 'default' },
  { id: 'model', name: MODEL_PRESET_NAME, source: 'model', premium: true },
];

/** The preset a stored id names, or null for one this build does not know. */
export function presetById(id: string | null): Preset | null {
  return PRESETS.find((preset) => preset.id === id) ?? null;
}
