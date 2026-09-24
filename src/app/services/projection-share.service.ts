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
import { applyPositionOverrides } from '../models/position-override';
import { readableDecimalSettings } from '../draft-projection/projection-settings-section/model-decimals';
import { ProjectionRankingService } from './projection-ranking.service';
import { ProjectionState } from './projection-serializer';
import { ScoredProjection, ScoringType } from '../models/projection.model';

/**
 * The most ranked rows a share may publish. Not the product rule — a share publishes the whole
 * board, and this only matches the cap the API enforces, sized above the largest player pool.
 */
export const SHARED_PLAYER_LIMIT = 2000;

@Injectable({
  providedIn: 'root',
})
export class ProjectionShareService {
  private readonly api = inject(Api);
  private readonly ranking = inject(ProjectionRankingService);

  getShare(projectionId: string): Observable<ShareLinkResponse> {
    return from(this.api.invoke(getProjectionShare, { id: projectionId }));
  }

  share(projectionId: string, players: SharedPlayer[]): Observable<ShareLinkResponse> {
    return from(this.api.invoke(shareProjection, { id: projectionId, body: { players } }));
  }

  /** Reads a published board: all of it, for any reader. */
  loadShared(token: string): Observable<SharedProjectionResponse> {
    return from(this.api.invoke(getSharedProjection, { token }));
  }

  /**
   * The rows a share of this projection publishes: its board ranked the way the editor's table
   * ranks it by default, under the decimals the table is read with (a board scored one way and
   * shown another would publish totals nobody could reproduce on the page), with the owner's
   * position corrections on the identity. The editor and the projection list both publish, and
   * both come through here, so the two cannot publish different boards for one projection.
   *
   * @param pool the player read model as served; the corrections are applied here.
   */
  rowsToPublish(state: ProjectionState, pool: Player[]): SharedPlayer[] {
    const projections = state.playerProjections;
    const ranked = this.ranking.rankOverall({
      projections,
      scoringType: state.scoringType,
      statWeights: state.statWeights,
      activeScoringColumns: state.activeScoringColumns,
      leagueSize: state.leagueSize,
      rosterSlots: state.rosterSlots,
      minGoalieGames: state.minGoalieGames,
      // A share publishes the board as it stands, which includes the order the owner put it in.
      manualRanking: state.manualRanking,
      decimalSettings: readableDecimalSettings(
        projections,
        state.decimalSettings,
        state.useDefaultDecimals,
      ),
    });
    const corrected = applyPositionOverrides(pool, state.positionOverrides);
    const playersById = new Map(corrected.map((player) => [player.id, player]));
    return this.toSharedPlayers(ranked, playersById, state.scoringType);
  }

  /**
   * Freezes a ranking into the rows a share publishes — all of it, since a visitor is meant to
   * read the whole board. Identity is denormalised here because the public page has no
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
