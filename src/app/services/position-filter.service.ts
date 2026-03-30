import { Injectable } from '@angular/core';
import { Player } from '../models/player.model';
import { PositionFilter, Projection } from '../models/projection.model';

@Injectable({
  providedIn: 'root',
})
export class PositionFilterService {
  getFilterType(filter: PositionFilter): 'skater' | 'goalie' | 'all' {
    switch (filter) {
      case 'ALL':
        return 'all';
      case 'G':
        return 'goalie';
      case 'SKATER':
      case 'C':
      case 'D':
      case 'LW':
      case 'RW':
        return 'skater';
    }
  }

  filterByPosition(
    projections: Projection[],
    playerMap: Map<number, Player>,
    filter: PositionFilter,
  ): Projection[] {
    if (filter === 'ALL') return projections;
    return projections.filter((pp) => {
      if (filter === 'SKATER') return pp.type === 'skater';
      if (filter === 'G') return pp.type === 'goalie';
      const player = playerMap.get(pp.playerId);
      if (!player || player.type !== 'skater') return false;
      return player.positions.has(filter);
    });
  }
}
