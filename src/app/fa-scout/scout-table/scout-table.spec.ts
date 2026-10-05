import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { Projection } from '../../models/projection.model';
import { Swap } from '../drop-candidates';
import { ScoutRow } from '../scout-ranking';
import { ScoutTableComponent } from './scout-table';

function skater(playerId: number, goals: number, toi: number): Projection {
  return {
    type: 'skater',
    playerId,
    stats: {
      scoring: { goals, assists: 20 } as never,
      utility: { gp: 70, toiPerGame: toi },
    },
  };
}

function row(
  playerId: number,
  name: string,
  rank: number,
  preseasonRank: number | null,
  preseasonToi: number | null,
  rising = false,
): ScoutRow {
  const line = skater(playerId, 15, 1380);
  return {
    player: {
      projection: line,
      playerId: String(playerId),
      name,
      teamAbbrev: 'SEA',
      positions: ['D'],
      availability: 'FREE_AGENT',
      clubGames: 70,
      expectedGames: 70,
      projected: new Set(['goals', 'assists']),
    },
    line,
    score: 85,
    rank,
    games: 70,
    preseason: preseasonToi === null ? null : skater(playerId, 5, preseasonToi),
    preseasonRank,
    rise: preseasonRank === null ? null : preseasonRank - rank,
    rising,
  };
}

describe('ScoutTableComponent', () => {
  beforeEach(() => MockBuilder(ScoutTableComponent));

  function render(rows: ScoutRow[], swaps: ReadonlyMap<string, Swap | null> | null = null) {
    return MockRender(ScoutTableComponent, {
      rows,
      scoringType: 'points',
      categories: ['goals', 'assists'],
      swaps,
    });
  }

  it('tags a riser, and shows the places he gained and where he stood', () => {
    const fixture = render([row(1, 'Brandon Montour', 1, 140, 1050, true)]);

    const text = ngMocks.formatText(fixture);
    expect(text).toContain('Brandon Montour');
    expect(text).toContain('Rising');
    expect(text).toContain('+139');
    expect(text).toContain('was 140');
  });

  it('shows the ice time now beside the preseason one, picked out when it grew', () => {
    const fixture = render([row(1, 'Brandon Montour', 1, 140, 1050, true)]);

    const toi = ngMocks.find(fixture, 'td.toi-col');
    expect(ngMocks.formatText(ngMocks.find(toi, '.toi-now'))).toBe('23:00');
    expect(ngMocks.formatText(ngMocks.find(toi, '.per-game'))).toBe('was 17:30');
    expect(toi.nativeElement.classList).toContain('toi-col--up');
  });

  it('marks a player the model did not project before the season as new, with no rise', () => {
    const fixture = render([row(2, 'Ivan Demidov', 3, null, null)]);

    const text = ngMocks.formatText(fixture);
    expect(text).toContain('New');
    expect(text).not.toContain('was');
  });

  it('writes a fall as a fall, without a tag', () => {
    const fixture = render([row(3, 'Steady Eddie', 30, 26, 1380)]);

    const text = ngMocks.formatText(fixture);
    expect(text).toContain('-4');
    expect(text).not.toContain('Rising');
    expect(ngMocks.find(fixture, 'td.toi-col').nativeElement.classList).not.toContain(
      'toi-col--up',
    );
  });

  it("heads a column for each of the league's categories", () => {
    const fixture = render([row(1, 'Brandon Montour', 1, 140, 1050, true)]);

    const headings = ngMocks.findAll(fixture, 'th.stat-col').map((th) => ngMocks.formatText(th));
    expect(headings).toEqual(['G', 'A']);
  });

  it("has no Swap column without a team of the user's", () => {
    const fixture = render([row(1, 'Brandon Montour', 1, 30, 1050)]);

    expect(ngMocks.formatText(fixture)).not.toContain('Swap');
  });

  it('shows the gain of each swap and the player to drop for it', () => {
    const drop = {
      player: {
        playerId: '7',
        name: 'Jake Walman',
        type: 'skater' as const,
        positions: ['D'],
        reserve: false,
        out: false,
        projection: null,
      },
      score: 60,
    };
    const fixture = render(
      [
        row(1, 'Brandon Montour', 1, 30, 1050),
        row(2, 'Ryan Graves', 2, 3, 1200),
        row(3, 'Nobody', 3, 4, 1200),
      ],
      new Map<string, Swap | null>([
        ['1', { drop, gain: 25 }],
        ['2', { drop, gain: -4.25 }],
        ['3', null],
      ]),
    );

    const text = (selector: string) =>
      ngMocks.findAll(fixture, selector).map((cell) => ngMocks.formatText(cell));
    expect(text('.swap-gain')).toEqual(['+25.0', '-4.3']);
    expect(text('.swap-drop')).toEqual(['for Jake Walman', 'for Jake Walman']);
    expect(text('.swap-none')).toEqual(['No room']);
  });
});
