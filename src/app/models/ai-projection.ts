/** What a preset seeded from the projection model asks the server for. */
export const MODEL_PRESET_SOURCE = 'model';

/** What a preset seeded from the model's rest of a season under way asks the server for. */
export const REST_OF_SEASON_PRESET_SOURCE = 'rest_of_season';

/** Every source the model fills, so switched off with the AI projection and sold with Premium. */
export const MODEL_SOURCES: readonly string[] = [MODEL_PRESET_SOURCE, REST_OF_SEASON_PRESET_SOURCE];
