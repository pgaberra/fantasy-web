import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApiConfiguration } from '../api/api-configuration';
import { seed } from '../api/fn/projection-model/seed';
import { SeededProjectionResponse } from '../api/models/seeded-projection-response';

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
   * Every line the model has for the coming season, keyed by the player pool's own ids.
   *
   * <p>Players the model cannot reach are absent rather than zeroed, so this covers fewer
   * players than the pool does — the counts on the response say by how much. There is no way
   * to ask for part of it, so a caller that wants a handful of rows still downloads the lot.
   */
  seed(season?: number): Observable<SeededProjectionResponse> {
    return seed(this.http, this.config.rootUrl, season === undefined ? {} : { season }).pipe(
      map((response) => response.body),
    );
  }
}
