import { MockBuilder } from 'ng-mocks';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DraftPlayerLookupService } from './draft-player-lookup.service';
import { Goalie } from '../models/player.model';

function goalie(id: number, headshot?: string): Goalie {
  return {
    id,
    type: 'goalie',
    name: `Goalie ${id}`,
    headshot,
    stats: {
      utility: { gp: 58 },
      scoring: {
        otl: 0,
        winPct: 0,
        toi: 0,
        gs: 58,
        w: 36,
        l: 17,
        sho: 3,
        sa: 1720,
        sv: 1565,
        ga: 155,
        gaa: 2.67,
        svPct: 0.91,
      },
    },
  };
}

describe('DraftPlayerLookupService', () => {
  let lookup: DraftPlayerLookupService;

  beforeEach(async () => {
    await MockBuilder(DraftPlayerLookupService);
    lookup = TestBed.inject(DraftPlayerLookupService);
  });

  describe('showAvatars', () => {
    // What every pool looks like while the BFF has player pictures switched off.
    it('is false while no player in the pool has a picture', () => {
      lookup.setPlayers([goalie(1), goalie(2)]);

      expect(lookup.showAvatars()).toEqual(false);
    });

    it('is true once any player has one, so the rest keep their initials and line up', () => {
      lookup.setPlayers([goalie(1), goalie(2, 'https://cdn.test/2.png')]);

      expect(lookup.showAvatars()).toEqual(true);
    });
  });
});
