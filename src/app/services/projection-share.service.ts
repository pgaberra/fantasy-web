import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { Api } from '../api/api';
import { getProjectionShare } from '../api/fn/projection-shares/get-projection-share';
import { shareProjection } from '../api/fn/projection-shares/share-projection';
import { getSharedProjection } from '../api/fn/shared-projections/get-shared-projection';
import { ShareLinkResponse } from '../api/models/share-link-response';
import { SharedPlayer } from '../api/models/shared-player';
import { SharedProjectionResponse } from '../api/models/shared-projection-response';
import { Player } from '../models/player.model';
import {
  PositionFilter,
  ScoredProjection,
  ScoringType,
  SortColumn,
  SortDirection,
} from '../models/projection.model';

/**
 * How a visitor has narrowed and ordered a shared board, as the public read takes it. The four
 * filters travel with the order because the server applies them together: they decide which rows
 * a visitor behind the sign-in gate is sent, not just how the ones they hold are arranged.
 */
export interface SharedBoardQuery {
  readonly position: PositionFilter;
  readonly search: string;
  readonly team: string;
  readonly rookies: boolean;
  readonly sort: SortColumn;
  readonly direction: SortDirection;
}

/**
 * The most ranked rows a share may publish. Not the product rule — a share publishes the whole
 * board, and this only matches the cap the API enforces, sized above the largest player pool. How
 * much of that board a visitor actually reads is decided by the BFF, which hands the full rows to
 * someone signed in and the top of them to everyone else.
 */
export const SHARED_PLAYER_LIMIT = 2000;

@Injectable({
  providedIn: 'root',
})
export class ProjectionShareService {
  private readonly api = inject(Api);

  getShare(projectionId: string): Observable<ShareLinkResponse> {
    return from(this.api.invoke(getProjectionShare, { id: projectionId }));
  }

  share(projectionId: string, players: SharedPlayer[]): Observable<ShareLinkResponse> {
    return from(this.api.invoke(shareProjection, { id: projectionId, body: { players } }));
  }

  /**
   * Reads a published board. The filters and the order are asked for rather than applied on
   * arrival because they decide *which* rows come back: a visitor who is not signed in receives
   * the top of the board under them, not the top of the published one narrowed and re-sorted in
   * the browser. Someone holding the whole board is unaffected, and passes nothing.
   */
  loadShared(token: string, query?: SharedBoardQuery): Observable<SharedProjectionResponse> {
    return from(this.api.invoke(getSharedProjection, { token, ...query }));
  }

  /**
   * Freezes a ranking into the rows a share publishes — all of it, since a signed-in visitor is
   * meant to read the whole board. Identity is denormalised here because the public page has no
   * player read model to join against: what gets stored is exactly what a visitor will see.
   */
  toSharedPlayers(
    ranked: ScoredProjection[],
    playersById: Map<number, Player>,
    scoringType: ScoringType,
    count = SHARED_PLAYER_LIMIT,
  ): SharedPlayer[] {
    return ranked.slice(0, count).map((scored, index) => {
      const player = playersById.get(scored.projection.playerId);
      return {
        playerId: scored.projection.playerId,
        name: player?.name ?? `Player ${scored.projection.playerId}`,
        teamAbbrev: player?.teamAbbrev,
        // Copied in so the public page can render a row without the player read model.
        headshot: player?.headshot,
        positions: player?.type === 'skater' ? [...player.positions] : undefined,
        type: scored.projection.type,
        rank: index + 1,
        value: scoringType === 'points' ? scored.score.fantasyPoints : scored.score.zScore,
        stats: {
          utility: { ...scored.projection.stats.utility },
          scoring: { ...scored.projection.stats.scoring },
        },
      };
    });
  }
}
