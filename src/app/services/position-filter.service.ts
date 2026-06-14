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
    return projections.filter((pp) => this.matches(pp, playerMap, filter));
  }

  matches(projection: Projection, playerMap: Map<number, Player>, filter: PositionFilter): boolean {
    if (filter === 'ALL') return true;
    if (filter === 'SKATER') return projection.type === 'skater';
    if (filter === 'G') return projection.type === 'goalie';
    const player = playerMap.get(projection.playerId);
    if (!player || player.type !== 'skater') return false;
    return player.positions.has(filter);
  }
}
