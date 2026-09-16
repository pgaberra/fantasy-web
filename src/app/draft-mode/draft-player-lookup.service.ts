import { computed, Injectable, signal } from '@angular/core';
import { Player } from '../models/player.model';
import { hasHeadshots } from '../shared/player-headshot/player-headshot';

/**
 * Player presentation lookups shared by the draft-mode panels. Provided at the
 * DraftModeComponent level so the orchestrator and its panels share one instance.
 */
@Injectable()
export class DraftPlayerLookupService {
  private readonly playersById = signal<Map<number, Player>>(new Map());

  /**
   * Whether the board draws avatars at all: not while no player in the pool has a picture, as
   * with player pictures switched off in the BFF. Decided over the pool and not per player, the
   * same rule as the projection tables, so a player without a picture still lines up.
   */
  readonly showAvatars = computed(() => hasHeadshots([...this.playersById().values()]));

  setPlayers(players: Player[]): void {
    this.playersById.set(new Map(players.map((player) => [player.id, player])));
  }

  name(playerId: number): string {
    return this.playersById().get(playerId)?.name ?? '';
  }

  team(playerId: number): string {
    return this.playersById().get(playerId)?.teamAbbrev ?? '';
  }

  positions(playerId: number): string[] {
    const player = this.playersById().get(playerId);
    if (!player) {
      return [];
    }
    return player.type === 'goalie' ? ['G'] : [...player.positions];
  }

  headshot(playerId: number): string | undefined {
    return this.playersById().get(playerId)?.headshot;
  }

  initials(playerId: number): string {
    const name = this.playersById().get(playerId)?.name ?? '';
    return name
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  primaryPosition(playerId: number): string {
    const player = this.playersById().get(playerId);
    if (!player) {
      return '';
    }
    if (player.type === 'goalie') {
      return 'g';
    }
    if (player.positions.has('C')) {
      return 'c';
    }
    if (player.positions.has('LW')) {
      return 'lw';
    }
    if (player.positions.has('RW')) {
      return 'rw';
    }
    if (player.positions.has('D')) {
      return 'd';
    }
    return 'util';
  }
}
