import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { Api } from '../api/api';
import { restOfSeasonStatus } from '../api/fn/projection-model/rest-of-season-status';
import { FeatureService } from './feature.service';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { REST_OF_SEASON_PRESET_SOURCE } from '../models/ai-projection';

/**
 * Whether a season is under way for the model right now: when its served lines cover what is left
 * of the season rather than a whole one. That is when a projection or a draft can be started from
 * the rest of the season (where the BFF offers that preset at all), and when the AI projection
 * ranks a league on the rest of the season, which Team Power Rankings says in its option.
 *
 * <p>Asked of the BFF only where `/features` reports the AI projection served, since elsewhere
 * the endpoint is a 404 and nothing offers the model anyway. A failed read leaves the preset
 * unoffered, like the features it rides on: the server refuses the draft then anyway.
 */
@Injectable({ providedIn: 'root' })
export class RestOfSeasonService {
  private readonly api = inject(Api);
  private readonly features = inject(FeatureService);

  private readonly status = rxResource({
    params: () => (this.features.aiProjection() ? true : undefined),
    stream: () => from(this.api.invoke(restOfSeasonStatus)),
  });

  /** False until the answer lands, so the preset is never shown and then taken away. */
  readonly available = computed(() =>
    this.status.hasValue() ? this.status.value().available : false,
  );

  /**
   * Whether the answer is in, or has failed, or was never needed because the AI projection is not
   * served. A page that names something by the season waits for this, rather than name it one way
   * and then the other.
   */
  readonly settled = computed(
    () =>
      this.features.settled() &&
      (!this.features.aiProjection() || this.status.hasValue() || !!this.status.error()),
  );

  /**
   * The presets this environment offers right now: `FeatureService.offeredPresets`, less the rest
   * of the season while there is none. One answer for every page that lists presets — the draft
   * picker and the new-projection page — so the two cannot offer different starting points.
   */
  offeredPresets<T extends { readonly source: CreateProjectionRequest['source'] }>(
    presets: readonly T[],
  ): readonly T[] {
    return this.features
      .offeredPresets(presets)
      .filter((preset) => preset.source !== REST_OF_SEASON_PRESET_SOURCE || this.available());
  }
}
