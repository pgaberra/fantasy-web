import { MockBuilder, MockRender } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerAvatarComponent } from './player-avatar';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { Goalie } from '../../models/player.model';

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

describe('PlayerAvatarComponent', () => {
  beforeEach(() => MockBuilder(PlayerAvatarComponent).keep(DraftPlayerLookupService));

  // The pool goes into the instance the avatar was given, the way the draft page fills the one it
  // provides for its panels.
  function render(players: Goalie[]): HTMLElement {
    const fixture = MockRender(PlayerAvatarComponent, { playerId: 1 });
    fixture.point.injector.get(DraftPlayerLookupService).setPlayers(players);
    fixture.detectChanges();
    return fixture.point.nativeElement;
  }

  it('draws the initials of a player without a picture while the board has avatars', () => {
    const avatar = render([goalie(1), goalie(2, 'https://cdn.test/2.png')]);

    expect(avatar.classList).toContain('pos--g');
    expect(avatar.classList).not.toContain('avatar--none');
    expect(avatar.textContent?.trim()).toEqual('G1');
  });

  it('hides itself while no player in the pool has a picture', () => {
    const avatar = render([goalie(1), goalie(2)]);

    expect(avatar.classList).toContain('pos--g');
    expect(avatar.classList).toContain('avatar--none');
  });
});
