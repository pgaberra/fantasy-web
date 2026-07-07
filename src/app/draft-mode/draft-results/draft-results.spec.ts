import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { DraftResultsComponent, DraftResultRound, DraftResultTeam } from './draft-results';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';

describe('DraftResultsComponent', () => {
  const rounds: DraftResultRound[] = [
    {
      round: 1,
      picks: [
        { pickInRound: 1, playerId: 1, teamName: 'My Team', mine: true },
        { pickInRound: 2, playerId: 2, teamName: 'Team 1', mine: false },
      ],
    },
    {
      round: 2,
      picks: [{ pickInRound: 1, playerId: 3, teamName: 'Team 1', mine: false }],
    },
  ];

  const teams: DraftResultTeam[] = [
    {
      team: { id: 'team-me', name: 'My Team', mine: true },
      picks: [{ overall: 1, playerId: 1 }],
    },
    {
      team: { id: 'team-1', name: 'Team 1', mine: false },
      picks: [
        { overall: 2, playerId: 2 },
        { overall: 3, playerId: 3 },
      ],
    },
  ];

  beforeEach(() =>
    MockBuilder(DraftResultsComponent).mock(DraftPlayerLookupService, {
      name: (playerId: number) => `Player ${playerId}`,
    }),
  );

  it('shows the round view by default with round headers and player names', () => {
    const fixture = MockRender(DraftResultsComponent, { rounds, teams });
    const text = fixture.nativeElement.textContent as string;

    expect(fixture.point.componentInstance.view()).toEqual('round');
    expect(text).toContain('Round 1');
    expect(text).toContain('Round 2');
    expect(text).toContain('Player 1');
    expect(text).toContain('My Team');
  });

  it('switches to the team view showing overall pick numbers', () => {
    const fixture = MockRender(DraftResultsComponent, { rounds, teams });

    fixture.point.componentInstance.view.set('team');
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('(1)');
    expect(text).toContain('(2)');
    expect(text).toContain('(3)');
  });
});
