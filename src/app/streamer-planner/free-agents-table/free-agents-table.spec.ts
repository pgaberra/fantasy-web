import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../../models/stat-key.model';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { RankedFreeAgent } from '../planner-free-agents';
import { FreeAgentsTableComponent } from './free-agents-table';

function scoringLine<K extends string>(keys: readonly K[], set: Record<string, number>) {
  return keys.reduce(
    (line, key) => ({ ...line, [key]: set[key] ?? 0 }),
    {} as Record<K, number>,
  ) as never;
}

const SKATER_STATS = {
  goals: 2.1,
  assists: 3,
  sog: 11.2,
  pim: 1.5,
  ppp: 0.8,
  blocks: 2,
  hits: 6.4,
};
const GOALIE_STATS = { w: 1.4, sv: 57.4, svPct: 0.908, gaa: 2.61 };

const SKATER_PLAYER: RankedFreeAgent['player'] = {
  playerId: '1',
  name: 'Top Scorer',
  teamAbbrev: 'EDM',
  positions: ['C', 'LW'],
  availability: 'FREE_AGENT',
  clubGames: 4,
  expectedGames: 3.75,
  projected: new Set(Object.keys(SKATER_STATS)),
  projection: {
    type: 'skater',
    playerId: 1,
    stats: {
      scoring: scoringLine(SKATER_SCORING_STAT_KEYS, SKATER_STATS),
      utility: { gp: 3.75, toiPerGame: 1052 },
    },
  },
};

const SKATER: RankedFreeAgent = {
  rank: 1,
  score: 11.25,
  games: 3.75,
  player: SKATER_PLAYER,
  line: SKATER_PLAYER.projection,
};

const GOALIE_PLAYER: RankedFreeAgent['player'] = {
  playerId: '2',
  name: 'Waiver Goalie',
  teamAbbrev: 'TB',
  positions: ['G'],
  availability: 'WAIVERS',
  clubGames: 3,
  expectedGames: 2,
  projected: new Set(Object.keys(GOALIE_STATS)),
  projection: {
    type: 'goalie',
    playerId: 2,
    stats: {
      scoring: scoringLine(GOALIE_SCORING_STAT_KEYS, GOALIE_STATS),
      utility: { gp: 2 },
    },
  },
};

const GOALIE: RankedFreeAgent = {
  rank: 2,
  score: 4,
  games: 2,
  player: GOALIE_PLAYER,
  line: GOALIE_PLAYER.projection,
};

const ROWS: RankedFreeAgent[] = [SKATER, GOALIE];

/** A Yahoo categories league: seven for skaters, three for goalies, in the league's order. */
const CATEGORIES: ScoringStatKey[] = [
  'goals',
  'assists',
  'sog',
  'pim',
  'ppp',
  'blocks',
  'hits',
  'w',
  'gaa',
  'svPct',
];

describe('FreeAgentsTableComponent', () => {
  beforeEach(() => MockBuilder(FreeAgentsTableComponent));

  function render(
    scoringType: 'points' | 'category' = 'points',
    categories: ScoringStatKey[] = CATEGORIES,
    rows: RankedFreeAgent[] = ROWS,
  ) {
    const fixture = MockRender(FreeAgentsTableComponent, {
      rows,
      scoringType,
      categories,
    });
    fixture.detectChanges();
    return fixture;
  }

  function headings(fixture: ReturnType<typeof render>): string[] {
    return ngMocks.findAll(fixture, 'thead .stat-col').map((cell) => ngMocks.formatText(cell));
  }

  /** Each player's stat cells: a cell a column, or the one cell his written-out line spans. */
  function cells(fixture: ReturnType<typeof render>): string[][] {
    return ngMocks
      .findAll(fixture, 'tbody tr')
      .map((row) => ngMocks.findAll(row, 'td.stat-col').map((cell) => ngMocks.formatText(cell)));
  }

  it('writes the players as one list in the order given, each with his overall rank', () => {
    const fixture = render();
    const rows = ngMocks.findAll(fixture, 'tbody tr.player-row');

    expect(rows.map((row) => ngMocks.formatText(ngMocks.find(row, '.rank-col')))).toEqual([
      '1',
      '2',
    ]);
    expect(ngMocks.formatText(rows[0])).toContain('Top Scorer');
    expect(ngMocks.formatText(rows[1])).toContain('Waiver Goalie');
  });

  it("writes the score the way the league's scoring is written, with the rate a game", () => {
    const fixture = render();
    const table = fixture.point.componentInstance;

    expect(table.scoreHeading()).toBe('Proj. pts');
    expect(table.score(SKATER)).toBe('11.3');
    expect(table.perGame(SKATER)).toBe('3.0/gm');

    const category = render('category');
    expect(category.point.componentInstance.scoreHeading()).toBe('Z-Score');
    expect(category.point.componentInstance.score(SKATER)).toBe('11.25');
  });

  it('gives a skater his ice time and his games, and a goalie no ice time', () => {
    const fixture = render();
    const table = fixture.point.componentInstance;

    expect(table.toi(SKATER)).toBe('17:32');
    expect(table.toi(GOALIE)).toBe('');
    expect(table.games(SKATER)).toBe('4');
  });

  it('heads a column with each skater category the league scores, named once', () => {
    const fixture = render();

    expect(headings(fixture)).toEqual(['G', 'A', 'SOG', 'PIM', 'PPP', 'BLK', 'HIT']);
    expect(cells(fixture)[0]).toEqual(['2.1', '3.0', '11.2', '1.5', '0.8', '2.0', '6.4']);
  });

  // The columns are the skaters' categories, so a goalie among them brings his own labels.
  it("writes a goalie's line across the skaters' columns, with its own labels", () => {
    const fixture = render();
    const goalieRow = ngMocks.findAll(fixture, 'tbody tr')[1];
    const line = ngMocks.find(goalieRow, 'td.other-line');

    expect((line.nativeElement as HTMLTableCellElement).colSpan).toBe(7);
    expect(ngMocks.findAll(line, 'li').map((stat) => ngMocks.formatText(stat))).toEqual([
      '1.4 W',
      '2.61 GAA',
      '0.908 SV%',
    ]);
  });

  it("heads the columns with the goalies' categories once the list is goalies alone", () => {
    const fixture = render('points', CATEGORIES, [GOALIE]);

    expect(headings(fixture)).toEqual(['W', 'GAA', 'SV%']);
    expect(cells(fixture)).toEqual([['1.4', '2.61', '0.908']]);
    // Ice time is a skater's number: no column of blanks for a list of goalies.
    expect(ngMocks.findAll(fixture, '.toi-col').length).toBe(0);
  });

  it('follows the league: other categories, other columns', () => {
    const fixture = render('points', ['goals', 'assists', 'sv']);

    expect(headings(fixture)).toEqual(['G', 'A']);
    expect(cells(fixture)).toEqual([['2.1', '3.0'], ['57 SV']]);
  });

  it('leaves a cell empty where the model gave the player no number, and keeps the column', () => {
    const bare: RankedFreeAgent = {
      ...SKATER,
      rank: 3,
      player: { ...SKATER_PLAYER, playerId: '3', projected: new Set(['goals']) },
    };
    const fixture = render('points', ['goals', 'assists'], [SKATER, bare]);

    expect(cells(fixture)).toEqual([
      ['2.1', '3.0'],
      ['2.1', ''],
    ]);
  });

  it('draws no stat cells where the league scores nothing for the players listed', () => {
    const fixture = render('points', ['w']);

    expect(headings(fixture)).toEqual([]);
    expect(cells(fixture)).toEqual([[], []]);
  });

  it('steps a category he is projected nothing in back from the rest', () => {
    const idle: RankedFreeAgent = {
      ...SKATER,
      line: {
        ...SKATER_PLAYER.projection,
        stats: {
          scoring: scoringLine(SKATER_SCORING_STAT_KEYS, { ...SKATER_STATS, ppp: 0 }),
          utility: { gp: 3.75, toiPerGame: 1052 },
        },
      } as RankedFreeAgent['line'],
    };
    const fixture = render('points', ['goals', 'ppp'], [idle]);

    expect(ngMocks.findAll(fixture, 'td.nil').map((cell) => ngMocks.formatText(cell))).toEqual([
      '0.0',
    ]);
  });

  // The crest already says which club; the abbreviation beside it said it twice.
  it('names the club by its crest alone, which then carries the name for a screen reader', () => {
    const fixture = render();
    const logos = ngMocks.findAll(fixture, TeamLogoComponent);

    expect(logos.map((logo) => ngMocks.input(logo, 'alt'))).toEqual(['EDM', 'TB']);
    expect(ngMocks.formatText(ngMocks.findAll(fixture, '.player-name')[0])).toBe('Top Scorer');
  });

  // An add is what the list is a list of; only a claim changes what the reader does next.
  it('tags a player on waivers and nobody else', () => {
    const fixture = render();
    const tags = ngMocks.findAll(fixture, '.player-status');

    expect(tags.length).toBe(1);
    expect(ngMocks.formatText(tags[0])).toBe('Waivers');
    expect(ngMocks.formatText(ngMocks.find(fixture, '.player-row'))).not.toContain('Free agent');
  });
  // Ranked by a few categories, those are the columns the order is read from.
  it('marks the columns the list is ranked by, and steps the rest back', () => {
    const fixture = MockRender(FreeAgentsTableComponent, {
      rows: [SKATER],
      scoringType: 'category',
      categories: ['goals', 'ppp', 'sog'],
      focus: new Set<ScoringStatKey>(['ppp']),
      focusLabel: 'PPP',
    });
    fixture.detectChanges();

    const text = (selector: string) =>
      ngMocks.findAll(fixture, selector).map((cell) => ngMocks.formatText(cell));
    expect(text('thead .stat-col--focus')).toEqual(['PPP']);
    expect(text('thead .stat-col--muted')).toEqual(['G', 'SOG']);
    expect(text('tbody .stat-col--focus')).toEqual(['0.8']);
    expect(fixture.point.componentInstance.scoreTip()).toContain('scored in PPP alone');
  });

  it('marks no column while the list is ranked by every category', () => {
    const fixture = render('category', ['goals', 'ppp'], [SKATER]);

    expect(ngMocks.findAll(fixture, '.stat-col--focus, .stat-col--muted')).toHaveLength(0);
  });
});
