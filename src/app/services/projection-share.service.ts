import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { Api } from '../api/api';
import { getProjectionShare } from '../api/fn/projection-shares/get-projection-share';
import { shareProjection } from '../api/fn/projection-shares/share-projection';
import { unshareProjection } from '../api/fn/projection-shares/unshare-projection';
import { getSharedProjection } from '../api/fn/shared-projections/get-shared-projection';
import { ShareLinkResponse } from '../api/models/share-link-response';
import { SharedPlayer } from '../api/models/shared-player';
import { SharedProjectionResponse } from '../api/models/shared-projection-response';
import { Player } from '../models/player.model';
import { ScoredProjection, ScoringType } from '../models/projection.model';

/**
 * How many ranked rows a share publishes. The link is meant to start a conversation, not to hand
 * the whole board to someone who never signed up — the public page says as much and points at
 * the sign-up.
 */
export const SHARED_PLAYER_COUNT = 100;

@Injectable({
  providedIn: 'root',
})
export class ProjectionShareService {
  private readonly api = inject(Api);

  getShare(projectionId: string): Observable<ShareLinkResponse> {
    return from(this.api.invoke(getProjectionShare, { id: projectionId }));
  }

  share(
    projectionId: string,
    players: SharedPlayer[],
    authorAlias?: string,
  ): Observable<ShareLinkResponse> {
    return from(
      this.api.invoke(shareProjection, {
        id: projectionId,
        body: { authorAlias: authorAlias?.trim() || undefined, players },
      }),
    );
  }

  unshare(projectionId: string): Observable<void> {
    return from(this.api.invoke(unshareProjection, { id: projectionId }));
  }

  loadShared(token: string): Observable<SharedProjectionResponse> {
    return from(this.api.invoke(getSharedProjection, { token }));
  }

  /**
   * Freezes the top of a ranking into the rows a share publishes. Identity is denormalised here
   * because the public page has no player read model to join against — what gets stored is
   * exactly what a visitor will see.
   */
  toSharedPlayers(
    ranked: ScoredProjection[],
    playersById: Map<number, Player>,
    scoringType: ScoringType,
    count = SHARED_PLAYER_COUNT,
  ): SharedPlayer[] {
    return ranked.slice(0, count).map((scored, index) => {
      const player = playersById.get(scored.projection.playerId);
      return {
        playerId: scored.projection.playerId,
        name: player?.name ?? `Player ${scored.projection.playerId}`,
        teamAbbrev: player?.teamAbbrev,
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
