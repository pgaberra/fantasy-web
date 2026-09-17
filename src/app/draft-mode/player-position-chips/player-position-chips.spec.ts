import { MockBuilder, MockRender } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerPositionChipsComponent } from './player-position-chips';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { Player } from '../../models/player.model';
import { SkaterPosition } from '../../models/position.model';

const SKATER_STATS = {
  goals: 0,
  assists: 0,
  points: 0,
  plusMinus: 0,
  pim: 0,
  ppg: 0,
  ppa: 0,
  ppp: 0,
  shg: 0,
  sha: 0,
  shp: 0,
  stpg: 0,
  stpa: 0,
  stp: 0,
  gwg: 0,
  hatTricks: 0,
  sog: 0,
  shPct: 0,
  fw: 0,
  fl: 0,
  hits: 0,
  blocks: 0,
  defPoints: 0,
  shifts: 0,
  toi: 0,
};

function skater(id: number, positions: SkaterPosition[]): Player {
  return {
    type: 'skater',
    id,
    name: `Skater ${id}`,
    positions: new Set(positions),
    stats: { scoring: SKATER_STATS, utility: { gp: 82, toiPerGame: 1200 } },
  };
}

describe('PlayerPositionChipsComponent', () => {
  beforeEach(() =>
    MockBuilder(PlayerPositionChipsComponent)
      .keep(DraftPlayerLookupService)
      .keep(PositionChipsComponent),
  );

  function chips(players: Player[], playerId: number): HTMLElement[] {
    const fixture = MockRender(PlayerPositionChipsComponent, { playerId });
    fixture.point.injector.get(DraftPlayerLookupService).setPlayers(players);
    fixture.detectChanges();
    return Array.from(fixture.point.nativeElement.querySelectorAll('.pos-chip'));
  }

  it('shows every position the player is eligible for, coloured by position', () => {
    const shown = chips([skater(1, ['C', 'LW'])], 1);

    expect(shown.map((chip) => chip.textContent?.trim())).toEqual(['C', 'LW']);
    expect(shown[0].classList).toContain('pos-chip');
    expect(shown[0].classList).toContain('pos--c');
    expect(shown[1].classList).toContain('pos-chip');
    expect(shown[1].classList).toContain('pos--lw');
  });

  it('shows nothing for a player the pool does not hold', () => {
    expect(chips([skater(1, ['D'])], 99)).toEqual([]);
  });
});
