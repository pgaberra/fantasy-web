import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { Api } from '../api/api';
import { list } from '../api/fn/projections/list';
import { get } from '../api/fn/projections/get';
import { create } from '../api/fn/projections/create';
import { update } from '../api/fn/projections/update';
import { delete$ } from '../api/fn/projections/delete';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { ProjectionResponse } from '../api/models/projection-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { UpdateProjectionRequest } from '../api/models/update-projection-request';

@Injectable({
  providedIn: 'root',
})
export class ProjectionStorageService {
  private readonly api = inject(Api);

  /**
   * The projections the user made. A draft started from a preset is stored as a projection of
   * its own kind, and is deliberately left out here — it is not their work to list, edit or
   * delete. Use {@link listWithPresetDrafts} where that row is the point.
   */
  listProjections(): Observable<ProjectionSummaryResponse[]> {
    return this.listWithPresetDrafts().pipe(
      map((projections) => projections.filter((projection) => projection.kind === 'projection')),
    );
  }

  listWithPresetDrafts(): Observable<ProjectionSummaryResponse[]> {
    return from(this.api.invoke(list));
  }

  loadProjection(id: string): Observable<ProjectionResponse> {
    return from(this.api.invoke(get, { id }));
  }

  createProjection(request: CreateProjectionRequest): Observable<ProjectionResponse> {
    return from(this.api.invoke(create, { body: request }));
  }

  updateProjection(id: string, request: UpdateProjectionRequest): Observable<ProjectionResponse> {
    return from(this.api.invoke(update, { id, body: request }));
  }

  deleteProjection(id: string): Observable<void> {
    return from(this.api.invoke(delete$, { id }));
  }
}
