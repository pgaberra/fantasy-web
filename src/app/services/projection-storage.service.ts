import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { Api } from '../api/api';
import { list } from '../api/fn/projections/list';
import { get } from '../api/fn/projections/get';
import { create } from '../api/fn/projections/create';
import { importFromShare } from '../api/fn/projections/import-from-share';
import { update } from '../api/fn/projections/update';
import { delete$ } from '../api/fn/projections/delete';
import { startDraft } from '../api/fn/projections/start-draft';
import { rename } from '../api/fn/projections/rename';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { ProjectionResponse } from '../api/models/projection-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { UpdateProjectionRequest } from '../api/models/update-projection-request';
import { ProjectionData } from '../api/models/projection-data';

@Injectable({
  providedIn: 'root',
})
export class ProjectionStorageService {
  private readonly api = inject(Api);

  /**
   * The projections the user made. Drafts are stored alongside them — a draft is a row of its
   * own, holding a copy of the board it is played against — and are deliberately left out here:
   * they are not boards to list, edit or share. Use {@link listAll} where they are the point.
   */
  listProjections(): Observable<ProjectionSummaryResponse[]> {
    return this.listAll().pipe(
      map((projections) => projections.filter((projection) => projection.kind === 'projection')),
    );
  }

  /**
   * Everything the user can open in the editor: what they made, plus the boards they copied
   * from a share link. A draft is left out — it holds picks, not a board anyone edits.
   */
  listEditable(): Observable<ProjectionSummaryResponse[]> {
    return this.listAll().pipe(
      map((projections) => projections.filter((projection) => projection.kind !== 'draft')),
    );
  }

  /** Boards and drafts together, which is what the draft page asks two questions of. */
  listAll(): Observable<ProjectionSummaryResponse[]> {
    return from(this.api.invoke(list));
  }

  loadProjection(id: string): Observable<ProjectionResponse> {
    return from(this.api.invoke(get, { id }));
  }

  createProjection(request: CreateProjectionRequest): Observable<ProjectionResponse> {
    return from(this.api.invoke(create, { body: request }));
  }

  /**
   * Copies a board someone published under a share link. The name is only worth sending to
   * settle a clash with a board already imported under the same one — the server otherwise
   * keeps the name it was shared as.
   *
   * @param seenUpdatedAt the board's `updatedAt` as the page showed it. Sent, a board its author
   *     has changed since is refused with 412 rather than copied: a link follows its projection,
   *     and the reader must not be handed numbers they never saw.
   */
  importFromShare(
    token: string,
    name?: string,
    seenUpdatedAt?: string,
  ): Observable<ProjectionResponse> {
    return from(this.api.invoke(importFromShare, { body: { token, name, seenUpdatedAt } }));
  }

  updateProjection(id: string, request: UpdateProjectionRequest): Observable<ProjectionResponse> {
    return from(this.api.invoke(update, { id, body: request }));
  }

  /**
   * Starts a draft against one of the user's boards. The board's player rows are copied by the
   * server, so `data` carries only the draft's own league and its setup — the ~0.5 MB of rows
   * never leaves the server, and the board is not written to at all.
   *
   * <p>The name is left to the server: it takes the board's, numbering it where another draft
   * already holds it ("My league (2)"). So the saved name is the one in the response, and a
   * board can be drafted against as many times as its owner likes.
   */
  startDraft(boardId: string, data: ProjectionData): Observable<ProjectionResponse> {
    return from(this.api.invoke(startDraft, { id: boardId, body: { data } }));
  }

  /**
   * Renames a board or a draft, without sending the board with it.
   *
   * @param derived true when the app worked the name out rather than the user typing it — a
   *     draft taking the name of the league it was just synced with. Such a rename is numbered
   *     on a clash instead of refused, and the server declines it altogether once the user has
   *     named the row themselves, so what comes back is what is stored.
   */
  renameProjection(
    id: string,
    name: string,
    derived = false,
  ): Observable<ProjectionSummaryResponse> {
    return from(this.api.invoke(rename, { id, body: { name, derived } }));
  }

  deleteProjection(id: string): Observable<void> {
    return from(this.api.invoke(delete$, { id }));
  }
}
