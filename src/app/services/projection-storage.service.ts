import { Injectable, inject } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { Api } from '../api/api';
import { list } from '../api/fn/projections/list';
import { get } from '../api/fn/projections/get';
import { create } from '../api/fn/projections/create';
import { importFromShare } from '../api/fn/projections/import-from-share';
import { copyFromShare } from '../api/fn/projections/copy-from-share';
import { update } from '../api/fn/projections/update';
import { delete$ } from '../api/fn/projections/delete';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { ProjectionResponse } from '../api/models/projection-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { UpdateProjectionRequest } from '../api/models/update-projection-request';

/** What following a share link came to, which is not the same thing as what it created. */
export interface FollowResult {
  readonly projection: ProjectionResponse;
  /**
   * The link was already followed, so nothing was created and this is the follow already held.
   * The server says so with 200 rather than 201, which is the only place the difference shows.
   */
  readonly alreadyFollowed: boolean;
}

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

  /**
   * Everything the user can open in the editor: what they made (their own projections and the
   * copies they took of shared ones), plus what they imported — the links they follow and the
   * spreadsheets they uploaded. A preset draft is left out: it is scaffolding for a draft, not a
   * projection anyone opens.
   *
   * <p>`kind` is what splits the two groups, and it already does: a copy is stored as the user's
   * own `projection`, while a follow and a spreadsheet import are both `imported`. What tells
   * those two apart is `origin`, which only a follow carries.
   */
  listEditable(): Observable<ProjectionSummaryResponse[]> {
    return this.listWithPresetDrafts().pipe(
      map((projections) => projections.filter((projection) => projection.kind !== 'preset_draft')),
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

  /**
   * Follows a projection someone published under a share link: a live mirror of theirs, rewritten
   * whenever they share it again, read-only apart from the follower's own draft. One per link, so
   * following the same link twice hands back the follow already held rather than making a second.
   *
   * @param seenUpdatedAt the projection's `updatedAt` as the page showed it. Sent, one whose
   *     author has changed it since is refused with 412 rather than followed: a link follows its
   *     projection, and the reader must not be handed numbers they never saw.
   */
  followShare(token: string, seenUpdatedAt?: string): Observable<FollowResult> {
    return from(
      this.api
        .invoke$Response(importFromShare, { body: { token, seenUpdatedAt } })
        .then((response) => ({
          projection: response.body,
          alreadyFollowed: response.status === 200,
        })),
    );
  }

  /**
   * Takes a copy of a shared projection: the user's own from that moment on, named by the server
   * after the share ("Copy of <name>"), with nothing its author does afterwards reaching it.
   *
   * @param seenUpdatedAt as {@link followShare}, and refused the same way.
   */
  copyFromShare(token: string, seenUpdatedAt?: string): Observable<ProjectionResponse> {
    return from(this.api.invoke(copyFromShare, { body: { token, seenUpdatedAt } }));
  }

  updateProjection(id: string, request: UpdateProjectionRequest): Observable<ProjectionResponse> {
    return from(this.api.invoke(update, { id, body: request }));
  }

  /**
   * Throws away the draft played against a projection, leaving the projection itself alone.
   *
   * <p>An omitted draft is what clears one, so the update sends back the settings as they
   * stand and nothing else: the player rows are keep-if-absent, which spares this the ~0.5 MB
   * of them. The settings do have to be read back first, since an update replaces those.
   *
   * <p>A draft started from a preset is not cleared this way — the projection under it holds
   * nothing but the picks, so there the whole thing is deleted instead.
   */
  clearDraft(id: string): Observable<ProjectionResponse> {
    return this.loadProjection(id).pipe(
      switchMap((projection) =>
        this.updateProjection(id, {
          name: projection.name,
          data: { settings: projection.data.settings },
        }),
      ),
    );
  }

  deleteProjection(id: string): Observable<void> {
    return from(this.api.invoke(delete$, { id }));
  }
}
