import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GOALIE_SCORING_STAT_KEYS,
  ScoringStatKey,
  SKATER_SCORING_STAT_KEYS,
} from '../../models/stat-key.model';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { FreeAgentGroup, RankedFreeAgent } from '../planner-free-agents';
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

const GROUPS: FreeAgentGroup[] = [
  { position: 'C', rows: [SKATER] },
  { position: 'G', rows: [GOALIE] },
];

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
  ) {
    const fixture = MockRender(FreeAgentsTableComponent, {
      groups: GROUPS,
      scoringType,
      categories,
    });
    fixture.detectChanges();
    return fixture;
  }

  function lines(fixture: ReturnType<typeof render>): string[][] {
    return ngMocks
      .findAll(fixture, '.player-line')
      .map((line) => ngMocks.findAll(line, '.stat').map((stat) => ngMocks.formatText(stat)));
  }

  it('writes each position as a band with its players under it', () => {
    const fixture = render();
    const bands = ngMocks.findAll(fixture, '.group-row');

    expect(bands.map((band) => ngMocks.formatText(band))).toEqual(['C', 'G']);
    expect(ngMocks.formatText(fixture)).toContain('Top Scorer');
    expect(ngMocks.formatText(fixture)).toContain('Waiver Goalie');
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
    expect(table.games(SKATER)).toBe('3.8');
  });

  it("writes each player's line in every category his league scores for his kind", () => {
    const fixture = render();

    expect(lines(fixture)).toEqual([
      ['2.1 G', '3.0 A', '11.2 SOG', '1.5 PIM', '0.8 PPP', '2.0 BLK', '6.4 HIT'],
      ['1.4 W', '2.61 GAA', '0.908 SV%'],
    ]);
  });

  it('follows the league: other categories, another line', () => {
    const fixture = render('points', ['goals', 'assists', 'sv']);

    expect(lines(fixture)).toEqual([['2.1 G', '3.0 A'], ['57 SV']]);
  });

  // The line sits under the name and the numbers beside it, with the score standing next to both.
  it("draws the line as a row of its own under the player's, beside the score", () => {
    const fixture = render();
    const rows = ngMocks.findAll(fixture, 'tbody tr');
    const classes = rows.map((row) => (row.nativeElement as HTMLElement).className);

    expect(classes.slice(0, 3)).toEqual(['group-row', 'player-row player-row--lined', 'line-row']);
    const score = ngMocks.find(rows[1], '.score-col').nativeElement as HTMLTableCellElement;
    expect(score.rowSpan).toBe(2);
    expect((ngMocks.find(rows[2], 'td').nativeElement as HTMLTableCellElement).colSpan).toBe(4);
  });

  it('draws no empty line for a player whose kind the league scores nothing for', () => {
    const fixture = render('points', ['goals', 'assists']);
    const rows = ngMocks.findAll(fixture, 'tbody tr');
    const goalieRow = rows[rows.length - 1];

    expect(lines(fixture)).toEqual([['2.1 G', '3.0 A']]);
    expect((goalieRow.nativeElement as HTMLElement).className).toBe('player-row');
    expect(
      (ngMocks.find(goalieRow, '.score-col').nativeElement as HTMLTableCellElement).rowSpan,
    ).toBe(1);
  });

  // Every skater's line is drawn on one grid and every goalie's on another, so a category is in
  // the same place from one player to the next.
  it('sizes the line to the width of the table: whole where it fits, in even lines where not', () => {
    const fixture = render();
    const [skaters, goalies] = fixture.point.componentInstance.bands();
    const tracks = (grid: string) => grid.split(') ').length;

    expect(tracks(skaters.rows[0].grid.wide)).toBe(7);
    expect(tracks(skaters.rows[0].grid.mid)).toBe(4);
    expect(tracks(skaters.rows[0].grid.narrow)).toBe(4);
    expect(tracks(goalies.rows[0].grid.narrow)).toBe(3);

    const line = ngMocks.find(fixture, '.player-line').nativeElement as HTMLElement;
    expect(line.style.getPropertyValue('--line-wide')).toBe(skaters.rows[0].grid.wide);
    expect(line.style.getPropertyValue('--line-narrow')).toBe(skaters.rows[0].grid.narrow);
  });

  it('draws a skater under two positions on the same grid in both', () => {
    const fixture = MockRender(FreeAgentsTableComponent, {
      groups: [
        { position: 'C', rows: [SKATER] },
        { position: 'LW', rows: [SKATER] },
      ] as FreeAgentGroup[],
      scoringType: 'points',
      categories: CATEGORIES,
    });
    fixture.detectChanges();
    const [centres, wingers] = fixture.point.componentInstance.bands();

    expect(wingers.rows[0].grid).toBe(centres.rows[0].grid);
  });

  // The crest already says which club; the abbreviation beside it said it twice.
  it('names the club by its crest alone, which then carries the name for a screen reader', () => {
    const fixture = render();
    const logos = ngMocks.findAll(fixture, TeamLogoComponent);

    expect(logos.map((logo) => ngMocks.input(logo, 'alt'))).toEqual(['EDM', 'TB']);
    expect(ngMocks.formatText(ngMocks.findAll(fixture, '.player-head')[0])).toBe('Top Scorer');
  });

  // An add is what the list is a list of; only a claim changes what the reader does next.
  it('tags a player on waivers and nobody else', () => {
    const fixture = render();
    const tags = ngMocks.findAll(fixture, '.player-status');

    expect(tags.length).toBe(1);
    expect(ngMocks.formatText(tags[0])).toBe('Waivers');
    expect(ngMocks.formatText(ngMocks.find(fixture, '.player-row'))).not.toContain('Free agent');
  });
});
