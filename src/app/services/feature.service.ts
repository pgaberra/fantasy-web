import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { Api } from '../api/api';
import { getFeatures } from '../api/fn/features/get-features';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { MODEL_PRESET_SOURCE } from '../models/ai-projection';

/**
 * What the BFF says this environment serves, read once per page load.
 *
 * <p>The BFF is the only place these are decided. It enforces the same answer at the endpoints
 * behind each feature, so a page that follows this cannot offer something every request for is
 * refused, and no build of the web can disagree with the server it talks to.
 */
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly api = inject(Api);

  // A failed read is not surfaced on purpose: it leaves the AI projection unoffered, which is what
  // the server would answer anyway if it is unreachable, and every page that offers it has its
  // own load against the same BFF that shows the outage.
  private readonly features = rxResource({
    stream: () => from(this.api.invoke(getFeatures)),
  });

  /**
   * Whether the AI projection is served here at all. False until the answer lands, so a preset
   * the environment turns out not to serve is never shown and then taken away. Nothing to do
   * with this account's plan: a locked AI projection is still served.
   */
  readonly aiProjection = computed(() =>
    this.features.hasValue() ? this.features.value().aiProjection : false,
  );

  /**
   * The presets this environment offers: every one of them where the AI projection is served,
   * and everything but the model-seeded one where it is not. A starting point the server will not
   * fill in must not be offered, on any page that lists presets.
   */
  offeredPresets<T extends { readonly source: CreateProjectionRequest['source'] }>(
    presets: readonly T[],
  ): readonly T[] {
    if (this.aiProjection()) {
      return presets;
    }
    return presets.filter((preset) => preset.source !== MODEL_PRESET_SOURCE);
  }
}
