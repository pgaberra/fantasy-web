import { Injectable } from '@angular/core';
import { Player } from '../models/player.model';
import { PlayerProjection, PositionFilter } from '../draft-projection/model';

@Injectable({
  providedIn: 'root',
})
export class PositionFilterService {
  filterByPosition(
    projections: PlayerProjection[],
    playerMap: Map<number, Player>,
    filter: PositionFilter,
  ): PlayerProjection[] {
    if (filter === 'ALL') return projections;
    return projections.filter((pp) => {
      const player = playerMap.get(pp.playerId);
      if (!player) return false;
      return player.positions.has(filter);
    });
  }
}
