import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, shareReplay, throwError } from 'rxjs';
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
   * The answers already asked for, keyed by what was asked. Held for the life of the tab: the
   * model's board changes when the nightly sync re-runs it, which is not something a page open
   * across it is expected to notice.
   */
  private readonly asked = new Map<string, Observable<SeededProjectionResponse>>();

  /**
   * The model's lines for the coming season, keyed by the player pool's own ids.
   *
   * <p>Players the model cannot reach are absent rather than zeroed, so this covers fewer
   * players than the pool does. The limits take only the top of the board — skaters by
   * projected points, goalies by projected wins — for a caller drawing a few rows rather than
   * seeding a projection; the counts on the response keep reporting the whole of what the model
   * reached either way, so a preview can still say how much of the league that is.
   *
   * <p>The same question is answered from what the first ask returned. The create page's
   * preview asks whenever the AI starting point is picked, so flipping between starting points
   * used to be one request per click — and on the server the limits save no work, so each of
   * those cost a full rebuild of the board. A failed ask is not kept: the next caller asks
   * again rather than being handed the error the first one got.
   */
  seed(params: SeedParams = {}): Observable<SeededProjectionResponse> {
    const key = keyOf(params);
    const asked = this.asked.get(key);
    if (asked) {
      return asked;
    }
    const answer = seed(this.http, this.config.rootUrl, params).pipe(
      map((response) => response.body),
      catchError((error: unknown) => {
        this.asked.delete(key);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.asked.set(key, answer);
    return answer;
  }
}

/**
 * Field by field rather than by serialising the object, so two callers agree whatever order they
 * wrote the properties in.
 */
function keyOf(params: SeedParams): string {
  return `${params.season ?? ''}/${params.skaterLimit ?? ''}/${params.goalieLimit ?? ''}`;
}
