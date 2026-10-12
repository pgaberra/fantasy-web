import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScoringStatKey, SKATER_SCORING_STAT_KEYS } from '../../models/stat-key.model';
import { Projection } from '../../models/projection.model';
import { LOWEST_FIRST, RosterRow, RosterSort } from '../planner-roster';
import { PlannerDay } from '../planner-schedule';
import { RosterTableComponent } from './roster-table';

function scoringLine<K extends string>(keys: readonly K[], set: Record<string, number>) {
  return keys.reduce(
    (line, key) => ({ ...line, [key]: set[key] ?? 0 }),
    {} as Record<K, number>,
  ) as never;
}

function skater(playerId: string, goals: number, assists: number): Projection {
  return {
    type: 'skater',
    playerId: Number(playerId),
    stats: {
      scoring: scoringLine(SKATER_SCORING_STAT_KEYS, { goals, assists }),
      utility: { gp: 3, toiPerGame: 1052 },
    },
  };
}

const NIGHTS: PlannerDay[] = [
  { date: '2026-10-13', games: 3, offNight: true },
  { date: '2026-10-15', games: 9, offNight: false },
];

function row(
  playerId: string,
  name: string,
  rank: number,
  score: number,
  games: number,
  statuses: ('start' | 'bench' | 'none')[],
  out = false,
): RosterRow {
  const projection = skater(playerId, 2, 1);
  return {
    player: {
      playerId,
      name,
      teamAbbrev: 'EDM',
      type: 'skater',
      positions: ['C'],
      out,
      injuryStatus: out ? 'IR' : undefined,
      clubGames: 3,
      expectedGames: 3,
      projected: new Set(['goals', 'assists']),
      projection,
    },
    line: games > 0 ? projection : skater(playerId, 0, 0),
    score,
    rank,
    games,
    clubGames: 2,
    nights: NIGHTS.map((day, index) => ({ date: day.date, status: statuses[index] })),
  };
}

const ROWS: RosterRow[] = [
  row('1', 'Benched Every Night', 1, 0, 0, ['bench', 'bench']),
  row('2', 'Out Injured', 2, 0, 0, ['none', 'none'], true),
  row('3', 'Starts One', 3, 4, 1, ['start', 'bench']),
  row('4', 'Starts Both', 4, 8, 2, ['start', 'start']),
];

const CATEGORIES: ScoringStatKey[] = ['goals', 'assists', 'w'];

describe('RosterTableComponent', () => {
  beforeEach(() => MockBuilder(RosterTableComponent));

  function render(sort?: RosterSort) {
    const fixture = MockRender(RosterTableComponent, {
      rows: ROWS,
      nights: NIGHTS,
      scoringType: 'points',
      categories: CATEGORIES,
      sort: sort ?? LOWEST_FIRST,
    });
    fixture.detectChanges();
    return fixture;
  }

  it('draws the starts beside the games, set off where he sits some or all of them', () => {
    const fixture = render();
    const starts = ngMocks.findAll(fixture, 'td.starts-col .starts');

    // The player who is out has no starts cell to set off: his whole row is dashes, below.
    expect(starts.map((cell) => ngMocks.formatText(cell))).toEqual(['0', '1', '2']);
    expect(starts.map((cell) => cell.classes['starts--none'] ?? false)).toEqual([
      true,
      false,
      false,
    ]);
    expect(starts.map((cell) => cell.classes['starts--some'] ?? false)).toEqual([
      false,
      true,
      false,
    ]);
    expect(
      ngMocks.findAll(fixture, 'td.games-col').map((cell) => ngMocks.formatText(cell)),
    ).toEqual(['2', '—', '2', '2']);
    expect(
      ngMocks
        .findAll(fixture, 'tr.player-row--benched .player-name')
        .map((c) => ngMocks.formatText(c)),
    ).toEqual(['Benched Every Night']);
  });

  it('fades a player who is out and writes a dash in every figure, not a score', () => {
    const fixture = render();
    const outRows = ngMocks.findAll(fixture, 'tr.player-row--out');
    expect(outRows).toHaveLength(1);
    const line = outRows[0];
    expect(ngMocks.formatText(ngMocks.find(line, '.player-name'))).toBe('Out Injured');
    expect(ngMocks.findAll(line, 'td.num').map((cell) => ngMocks.formatText(cell))).toEqual([
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
    ]);
    // The nights keep their marks: each says he has no game.
    expect(ngMocks.findAll(line, '.night--none')).toHaveLength(2);
  });

  it('marks each counted night as a start, a bench or no game, each saying which', () => {
    const fixture = render();
    const heads = ngMocks.findAll(fixture, 'th.night-col');
    expect(heads.map((head) => ngMocks.formatText(ngMocks.find(head, '.night-day')))).toEqual([
      'Tue',
      'Thu',
    ]);
    expect(heads.map((head) => ngMocks.formatText(ngMocks.find(head, '.night-date')))).toEqual([
      '13',
      '15',
    ]);

    const marks = ngMocks
      .findAll(fixture, 'tbody tr')
      .map((line) =>
        ngMocks
          .findAll(line, '.night')
          .map((mark) => mark.nativeElement.getAttribute('aria-label')),
      );
    expect(marks).toEqual([
      ['Tue Oct 13: on the bench', 'Thu Oct 15: on the bench'],
      ['Tue Oct 13: no game', 'Thu Oct 15: no game'],
      ['Tue Oct 13: starts', 'Thu Oct 15: on the bench'],
      ['Tue Oct 13: starts', 'Thu Oct 15: starts'],
    ]);
    expect(ngMocks.findAll(fixture, '.night--start')).toHaveLength(3);
    expect(ngMocks.findAll(fixture, '.night--bench')).toHaveLength(3);
    expect(ngMocks.findAll(fixture, '.night--none')).toHaveLength(2);
  });

  it("tags a player who is out by his status, and writes his line in the league's categories", () => {
    const fixture = render();
    expect(ngMocks.formatText(ngMocks.find(fixture, '.player-out'))).toBe('IR');
    // Only the categories someone has a number for are columns: no goalie column here.
    expect(
      ngMocks.findAll(fixture, 'thead .stat-col').map((cell) => ngMocks.formatText(cell)),
    ).toEqual(['G', 'A']);
    const cells = ngMocks
      .findAll(fixture, 'tbody tr')
      .map((line) => ngMocks.findAll(line, 'td.stat-col').map((cell) => ngMocks.formatText(cell)));
    expect(cells[0]).toEqual(['0.0', '0.0']);
    expect(cells[3]).toEqual(['2.0', '1.0']);
  });

  it('shows the order it is in, and asks the page to sort by a heading pressed', () => {
    const fixture = render({ key: 'games', descending: true });
    const sorted: string[] = [];
    ngMocks.findInstance(RosterTableComponent).sortBy.subscribe((key) => sorted.push(key));

    const heading = ngMocks.find(fixture, 'th.starts-col');
    expect(heading.nativeElement.getAttribute('aria-sort')).toBe('descending');
    ngMocks.click(ngMocks.find(heading, 'button'));
    ngMocks.click(ngMocks.find(ngMocks.findAll(fixture, 'thead th')[4], 'button'));
    expect(sorted).toEqual(['games', 'clubGames']);
  });
});
