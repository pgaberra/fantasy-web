import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { Api } from '../api/api';
import { restOfSeasonStatus } from '../api/fn/projection-model/rest-of-season-status';
import { FeatureService } from './feature.service';

/**
 * Whether a draft can be started from the rest of the season right now: only while a season is
 * under way, when the model has a line for what is left of it.
 *
 * <p>Asked of the BFF only where it serves the AI projection, since elsewhere the question is
 * answered already and the endpoint is a 404. A failed read leaves the preset unoffered, like the
 * features it rides on: the server refuses the draft then anyway.
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
}
