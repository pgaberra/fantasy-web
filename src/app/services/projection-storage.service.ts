import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { Api } from '../api/api';
import { list } from '../api/fn/projections/list';
import { get } from '../api/fn/projections/get';
import { create } from '../api/fn/projections/create';
import { importFromShare } from '../api/fn/projections/import-from-share';
import { copyFromShare } from '../api/fn/projections/copy-from-share';
import { update } from '../api/fn/projections/update';
import { delete$ } from '../api/fn/projections/delete';
import { startDraft } from '../api/fn/projections/start-draft';
import { rename } from '../api/fn/projections/rename';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { ProjectionResponse } from '../api/models/projection-response';
import { CreateProjectionRequest } from '../api/models/create-projection-request';
import { UpdateProjectionRequest } from '../api/models/update-projection-request';
import { ProjectionData } from '../api/models/projection-data';

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
   * Everything the user can open in the editor: what they made (their own projections and the
   * copies they took of shared ones), plus what they imported — the links they follow and the
   * spreadsheets they uploaded. A draft is left out: it holds picks, not a board anyone edits.
   *
   * <p>`kind` is what splits those two groups, and it already does: a copy is stored as the
   * user's own `projection`, while a follow and a spreadsheet import are both `imported`. What
   * tells those two apart is `origin`, which only a follow carries.
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
