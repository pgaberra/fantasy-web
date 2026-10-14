import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Projection } from '../../models/projection.model';
import { ScoutPlayer, TeamPlayer } from '../../services/player-scout.service';
import { LineupSwap } from '../lineup-value';
import { ScoutRow } from '../scout-ranking';
import { usageChange } from '../scout-usage';
import { ScoutTableComponent } from './scout-table';

function skater(playerId: number, goals: number, toi: number, games = 70): Projection {
  return {
    type: 'skater',
    playerId,
    stats: {
      scoring: { goals, assists: 20 } as never,
      utility: { gp: games, toiPerGame: toi },
    },
  };
}

interface RowOptions {
  readonly thenRank?: number | null;
  readonly thenToi?: number | null;
  readonly thenGoals?: number;
  readonly thenGames?: number;
  readonly delta?: number | null;
  readonly rising?: boolean;
  readonly owner?: ScoutPlayer['owner'];
  readonly usage?: ScoutPlayer['usage'];
}

function row(playerId: number, name: string, rank: number, options: RowOptions = {}): ScoutRow {
  const line = skater(playerId, 15, 1380);
  const thenRank = options.thenRank ?? null;
  const then =
    options.thenToi === null || options.thenToi === undefined
      ? null
      : skater(playerId, options.thenGoals ?? 5, options.thenToi, options.thenGames ?? 70);
  const scout: ScoutPlayer = {
    freeAgent: {
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
    nhlId: 8400000 + playerId,
    type: 'skater',
    owner: options.owner ?? null,
    then,
    thenProjected: new Set(then ? ['goals', 'assists'] : []),
    usage: options.usage ?? null,
  };
  return {
    scout,
    player: scout.freeAgent,
    line,
    score: 85,
    rank,
    games: 70,
    then,
    thenScore: then ? 85 - (options.delta ?? 0) : null,
    thenRank,
    delta: then ? (options.delta ?? 0) : null,
    rise: thenRank === null ? null : thenRank - rank,
    rising: options.rising ?? false,
    usage: usageChange(scout.usage),
  };
}

/** A goalie's row: no ice time, now or then, and no usage. */
function goalieRow(playerId: number, rank: number): ScoutRow {
  const line: Projection = {
    type: 'goalie',
    playerId,
    stats: { scoring: { w: 20 } as never, utility: { gp: 40 } },
  };
  const skaterRow = row(playerId, 'Joey Daccord', rank);
  return {
    ...skaterRow,
    scout: {
      ...skaterRow.scout,
      type: 'goalie',
      freeAgent: { ...skaterRow.player, projection: line, positions: ['G'] },
    },
    player: { ...skaterRow.player, projection: line, positions: ['G'] },
    line,
    then: null,
  };
}

const USAGE: ScoutPlayer['usage'] = {
  recent: { games: 4, toiPerGame: 1380, ppShare: 0.8 },
  baseline: { games: 6, toiPerGame: 1050, ppShare: 0.1 },
  baselineSource: 'SEASON',
  listedNow: { seenOn: '2026-10-13', line: 'd1', powerPlayUnit: 1, outOfLineup: false },
  listedBefore: { seenOn: '2026-10-06', line: 'd3', outOfLineup: false },
};

describe('ScoutTableComponent', () => {
  beforeEach(() => MockBuilder(ScoutTableComponent));

  function render(
    rows: ScoutRow[],
    extra: { swaps?: ReadonlyMap<string, LineupSwap | null> | null; showOwner?: boolean } = {},
  ) {
    return MockRender(ScoutTableComponent, {
      rows,
      scoringType: 'points',
      categories: ['goals', 'assists'],
      sinceLabel: 'vs 7 Oct',
      ...extra,
    });
  }

  it('tags a riser, and writes the places he gained, where he stood and the change in score', () => {
    const fixture = render([
      row(1, 'Brandon Montour', 1, { thenRank: 140, thenToi: 1050, delta: 32.5, rising: true }),
    ]);

    const text = ngMocks.formatText(fixture);
    expect(text).toContain('Brandon Montour');
    expect(text).toContain('Rising');
    expect(text).toContain('+139');
    expect(text).toContain('was 140');
    const score = ngMocks.find(fixture, 'td.score-col');
    expect(ngMocks.formatText(ngMocks.find(score, '.score'))).toBe('85.0');
    const delta = ngMocks.find(score, '.delta');
    expect(ngMocks.formatText(delta)).toBe('+32.5');
    expect(delta.nativeElement.classList).toContain('delta--up');
  });

  it('names what the then-lines are above the projection columns', () => {
    const fixture = render([row(1, 'Brandon Montour', 1, { thenRank: 3, thenToi: 1050 })]);

    const group = ngMocks.findAll(fixture, '.group-col--start')[0];
    expect(ngMocks.formatText(group)).toContain('Projection');
    expect(ngMocks.formatText(group)).toContain('vs 7 Oct');
  });

  it("writes each figure with its change underneath, in the stat's own precision and sense", () => {
    const fixture = render([
      row(1, 'Brandon Montour', 1, { thenRank: 3, thenToi: 1050, thenGoals: 5, thenGames: 74 }),
    ]);

    const toi = ngMocks.find(fixture, 'td.toi-col');
    expect(ngMocks.formatText(ngMocks.find(toi, '.figure-now'))).toBe('23:00');
    expect(ngMocks.formatText(ngMocks.find(toi, '.delta'))).toBe('+5:30');
    expect(ngMocks.find(toi, '.delta').nativeElement.classList).toContain('delta--up');
    const goals = ngMocks.findAll(fixture, 'td.stat-col')[0];
    expect(ngMocks.formatText(ngMocks.find(goals, '.figure-now'))).toBe('15.0');
    expect(ngMocks.formatText(ngMocks.find(goals, '.delta'))).toBe('+10.0');
    // Four games fewer than the day's line expected: down, and said so.
    const cells = ngMocks.findAll(fixture, 'td.num');
    const games = cells.find((cell) => ngMocks.formatText(cell).startsWith('70'));
    expect(games && ngMocks.formatText(ngMocks.find(games, '.delta'))).toBe('-4');
  });

  it('greys a change too small to mean anything', () => {
    const fixture = render([
      row(1, 'Steady Eddie', 1, { thenRank: 1, thenToi: 1370, thenGoals: 15 }),
    ]);

    const toi = ngMocks.find(fixture, 'td.toi-col .delta');
    expect(ngMocks.formatText(toi)).toBe('+0:10');
    expect(toi.nativeElement.classList).toContain('delta--flat');
    const goals = ngMocks.find(fixture, 'td.stat-col .delta');
    expect(ngMocks.formatText(goals)).toBe('±0.0');
    expect(goals.nativeElement.classList).toContain('delta--flat');
  });

  it('shows the ice since the day beside the change from before, and where the page lists him', () => {
    const fixture = render([
      row(1, 'Brandon Montour', 1, { thenRank: 3, thenToi: 1050, usage: USAGE }),
    ]);

    const ice = ngMocks.find(fixture, 'td.ice-col');
    expect(ngMocks.formatText(ngMocks.find(ice, '.figure-now'))).toBe('23:00');
    expect(ngMocks.formatText(ngMocks.find(ice, '.delta'))).toBe('+5:30');
    const share = ngMocks
      .findAll(fixture, 'td.num')
      .find((cell) => ngMocks.formatText(cell).startsWith('80%'));
    expect(share && ngMocks.formatText(ngMocks.find(share, '.delta'))).toBe('+70 pts');
    const lineup = ngMocks.find(fixture, 'td.lineup-col');
    expect(ngMocks.formatText(ngMocks.find(lineup, '.listed'))).toBe('D1 · PP1');
    expect(ngMocks.find(lineup, '.listed').nativeElement.classList).toContain('listed--up');
    expect(ngMocks.formatText(ngMocks.find(lineup, '.delta--note'))).toBe('was D3 · No PP');
  });

  it('heads no ice columns when nobody listed has any', () => {
    const fixture = render([row(1, 'Brandon Montour', 1, { thenRank: 3, thenToi: 1050 })]);

    expect(ngMocks.findAll(fixture, 'th.ice-col')).toHaveLength(0);
    expect(ngMocks.findAll(fixture, 'th.lineup-col')).toHaveLength(0);
  });

  it('lists a goalie among the skaters with his ice cells empty', () => {
    const fixture = render([
      row(1, 'Brandon Montour', 1, { thenRank: 3, thenToi: 1050, usage: USAGE }),
      goalieRow(2, 2),
    ]);

    const toi = ngMocks.findAll(fixture, 'td.toi-col');
    expect(toi).toHaveLength(2);
    expect(ngMocks.formatText(toi[1])).toBe('');
    expect(ngMocks.formatText(ngMocks.findAll(fixture, 'td.ice-col')[1])).toBe('');
  });

  it('heads no ice time column over goalies alone', () => {
    const fixture = render([goalieRow(2, 2)]);

    expect(ngMocks.findAll(fixture, 'th.toi-col')).toHaveLength(0);
  });

  it('marks a player the model had no line for on the day as new, with no change', () => {
    const fixture = render([row(2, 'Ivan Demidov', 3)]);

    const text = ngMocks.formatText(fixture);
    expect(text).toContain('New');
    expect(text).not.toContain('was');
    expect(ngMocks.findAll(fixture, 'td.score-col .delta')).toHaveLength(0);
  });

  it('writes a fall as a fall, without a tag', () => {
    const fixture = render([
      row(3, 'Steady Eddie', 30, { thenRank: 26, thenToi: 1380, delta: -3 }),
    ]);

    const text = ngMocks.formatText(fixture);
    expect(text).toContain('-4');
    expect(text).not.toContain('Rising');
    expect(ngMocks.find(fixture, 'td.score-col .delta').nativeElement.classList).toContain(
      'delta--down',
    );
  });

  it('says who holds each player when asked to', () => {
    const fixture = render(
      [
        row(1, 'Brandon Montour', 1),
        row(2, 'Cale Makar', 2, { owner: { teamName: 'Slapshots', mine: true } }),
        row(3, 'Nathan MacKinnon', 3, { owner: { teamName: 'Someone Else', mine: false } }),
      ],
      { showOwner: true },
    );

    const tags = ngMocks
      .findAll(fixture, '.scout-tag--owner')
      .map((tag) => ngMocks.formatText(tag));
    expect(tags).toEqual(['FA', 'Mine', 'Someone Else']);
    expect(ngMocks.findAll(fixture, '.scout-tag--mine')).toHaveLength(1);
  });

  it("heads a column for each of the league's categories", () => {
    const fixture = render([row(1, 'Brandon Montour', 1, { thenRank: 3, thenToi: 1050 })]);

    const headings = ngMocks.findAll(fixture, 'th.stat-col').map((th) => ngMocks.formatText(th));
    expect(headings).toEqual(['G', 'A']);
  });

  it('asks the page to sort by a heading pressed', () => {
    const sortBy = vi.fn();
    const fixture = MockRender(ScoutTableComponent, {
      rows: [row(1, 'Brandon Montour', 1, { thenRank: 3, thenToi: 1050, usage: USAGE })],
      scoringType: 'points',
      categories: ['goals', 'assists'],
      sortBy,
    });

    const press = (label: string) =>
      ngMocks
        .findAll(fixture, 'th button.sort')
        .find((button) => ngMocks.formatText(button) === label)
        ?.nativeElement.click();
    press('Rank');
    press('change');
    press('Ice');
    press('PP share');
    ngMocks.find(fixture, 'th.stat-col button.sort').nativeElement.click();

    expect(sortBy.mock.calls).toEqual([['rise'], ['delta'], ['ice'], ['powerPlay'], ['goals']]);
  });

  it('marks the column the list is sorted by, and which way', () => {
    const fixture = MockRender(ScoutTableComponent, {
      rows: [row(1, 'Brandon Montour', 1, { thenRank: 3, thenToi: 1050 })],
      scoringType: 'points',
      categories: ['goals', 'assists'],
      sort: { key: 'assists', descending: false },
    });

    const sorted = ngMocks.findAll(fixture, 'th[aria-sort]');
    expect(sorted).toHaveLength(1);
    expect(ngMocks.formatText(sorted[0])).toBe('A');
    expect(sorted[0].nativeElement.getAttribute('aria-sort')).toBe('ascending');
  });

  it("has no Swap column without a team of the user's", () => {
    const fixture = render([row(1, 'Brandon Montour', 1, { thenRank: 30, thenToi: 1050 })]);

    expect(ngMocks.formatText(fixture)).not.toContain('Swap');
  });

  it('shows the gain of each swap and the player to drop for it, and nothing for a rostered player', () => {
    const drop: TeamPlayer = {
      playerId: '7',
      name: 'Jake Walman',
      type: 'skater',
      positions: ['D'],
      reserve: false,
      out: false,
      reserveEligible: [],
      projection: null,
    };
    const fixture = render(
      [
        row(1, 'Brandon Montour', 1),
        row(2, 'Ryan Graves', 2),
        row(3, 'Nobody', 3),
        row(4, 'Pavel Zacha', 4),
        row(5, 'Conor Garland', 5),
        row(6, 'Cale Makar', 6, { owner: { teamName: 'Slapshots', mine: true } }),
      ],
      {
        swaps: new Map<string, LineupSwap | null>([
          ['1', { kind: 'drop', drop, gain: 25 }],
          ['2', { kind: 'drop', drop, gain: -4.25 }],
          ['3', null],
          [
            '4',
            {
              kind: 'reserve',
              move: { player: { ...drop, name: 'Filip Hronek' }, slot: 'IR' },
              gain: 80,
            },
          ],
          ['5', { kind: 'open', gain: 70 }],
        ]),
      },
    );

    const text = (selector: string) =>
      ngMocks.findAll(fixture, selector).map((cell) => ngMocks.formatText(cell));
    expect(text('.swap-gain')).toEqual(['+25.0', '-4.3', '+80.0', '+70.0']);
    expect(text('.swap-drop')).toEqual([
      'for Jake Walman',
      'for Jake Walman',
      'Filip Hronek to IR',
      'open spot',
    ]);
    expect(text('.swap-none')).toEqual(['No one to drop']);
    expect(ngMocks.formatText(ngMocks.findAll(fixture, 'td.swap-col')[5])).toBe('');
  });
});
