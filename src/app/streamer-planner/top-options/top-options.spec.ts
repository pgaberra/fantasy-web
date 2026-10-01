import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { RankedFreeAgent } from '../planner-free-agents';
import { TopOptionsComponent } from './top-options';

function player(
  playerId: string,
  name: string,
  teamAbbrev: string | undefined,
  positions: string[],
  availability: RankedFreeAgent['player']['availability'],
): RankedFreeAgent['player'] {
  return {
    playerId,
    name,
    teamAbbrev,
    positions,
    availability,
    clubGames: 2,
    expectedGames: 2,
    projected: new Set(),
    projection: { type: 'skater', playerId: Number(playerId), stats: {} as never },
  };
}

function option(
  rank: number,
  score: number,
  games: number,
  who: RankedFreeAgent['player'],
): RankedFreeAgent {
  return { rank, score, games, player: who, line: who.projection };
}

const ROWS: RankedFreeAgent[] = [
  option(1, 11, 2, player('1', 'Top Scorer', 'EDM', ['C', 'LW'], 'FREE_AGENT')),
  option(2, 4, 0, player('2', 'Waiver Goalie', undefined, ['G'], 'WAIVERS')),
];

describe('TopOptionsComponent', () => {
  beforeEach(() => MockBuilder(TopOptionsComponent));

  function cards(scoringType: 'points' | 'category') {
    const fixture = MockRender(TopOptionsComponent, { rows: ROWS, scoringType });
    return ngMocks.findAll(fixture, '.option-card').map((card) => ngMocks.formatText(card));
  }

  it('cards each player with his club, positions, score, games and score a game', () => {
    const [first, second] = cards('points');

    expect(first).toContain('Top Scorer');
    expect(first).toContain('EDM, C, LW');
    expect(first).toContain('11.0Proj. pts');
    expect(first).toContain('5.5Per game');
    expect(first).not.toContain('Waivers');
    // No club to name, and no games to divide by.
    expect(second).toContain('Waiver Goalie G');
    expect(second).toContain('Waivers');
  });

  it('writes a category league in z-scores to two places', () => {
    const [first] = cards('category');

    expect(first).toContain('11.00Z-Score');
    expect(first).toContain('5.50Per game');
  });
});
