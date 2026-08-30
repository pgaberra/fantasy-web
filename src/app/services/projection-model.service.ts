import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApiConfiguration } from '../api/api-configuration';
import { seed } from '../api/fn/projection-model/seed';
import { SeededProjectionResponse } from '../api/models/seeded-projection-response';

/** What to ask the model for. Everything it has, unless narrowed. */
export interface SeedParams {
  season?: number;
  skaterLimit?: number;
  goalieLimit?: number;
}

/**
 * The projection model's own output, as opposed to a projection someone has saved.
 *
 * <p>Kept apart from {@link ProjectionStorageService}, which owns the user's projections: this
 * is the model talking, and nothing here belongs to anyone.
 */
@Injectable({ providedIn: 'root' })
export class ProjectionModelService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ApiConfiguration);

  /**
   * The model's lines for the coming season, keyed by the player pool's own ids.
   *
   * <p>Players the model cannot reach are absent rather than zeroed, so this covers fewer
   * players than the pool does. The limits take only the top of the board — skaters by
   * projected points, goalies by projected wins — for a caller drawing a few rows rather than
   * seeding a projection; the counts on the response keep reporting the whole of what the model
   * reached either way, so a preview can still say how much of the league that is.
   */
  seed(params: SeedParams = {}): Observable<SeededProjectionResponse> {
    return seed(this.http, this.config.rootUrl, params).pipe(map((response) => response.body));
  }
}
