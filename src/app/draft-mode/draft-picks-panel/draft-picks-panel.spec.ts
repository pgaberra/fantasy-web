import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { DraftPicksPanelComponent, DraftPickRound } from './draft-picks-panel';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { PlayerPositionChipsComponent } from '../player-position-chips/player-position-chips';

describe('DraftPicksPanelComponent', () => {
  const pickRounds: DraftPickRound[] = [
    {
      round: 1,
      picks: [
        { overall: 1, playerId: 7, teamName: 'My Team', mine: true },
        { overall: 2, playerId: 9, teamName: 'Team 2', mine: false },
      ],
    },
  ];

  beforeEach(() =>
    MockBuilder(DraftPicksPanelComponent).mock(DraftPlayerLookupService, {
      name: (playerId: number) => `Player ${playerId}`,
    }),
  );

  // The avatar's colour used to be the only sign of a pick's position here, and the avatar is
  // hidden while no player has a picture.
  it("shows each pick's positions beside its team", () => {
    const fixture = MockRender(DraftPicksPanelComponent, {
      pickRounds,
      editingPick: null,
      picksCount: 2,
    });

    const chips = ngMocks.findAll(fixture, PlayerPositionChipsComponent);

    expect(chips.map((chip) => chip.componentInstance.playerId())).toEqual([7, 9]);
    expect(
      chips.map((chip) => chip.nativeElement.parentElement?.classList.contains('feed-sub')),
    ).toEqual([true, true]);
  });
});
