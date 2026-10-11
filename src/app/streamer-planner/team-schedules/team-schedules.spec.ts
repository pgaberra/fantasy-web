import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerTeamRow } from '../planner-schedule';
import { TeamSchedulesComponent } from './team-schedules';

function row(team: string, rank: number, score: number, games: number): PlannerTeamRow {
  return {
    team,
    games,
    homeGames: 1,
    awayGames: games - 1,
    offNightGames: 1,
    backToBacks: 0,
    favourable: 1,
    unfavourable: 0,
    score,
    rank,
    schedule: [
      {
        date: '2026-10-13',
        opponent: 'SJS',
        home: false,
        offNight: true,
        backToBack: true,
        opponentGoalsAgainst: 1.12,
        opponentGoalsFor: 1.08,
        skaterWorth: 1.351,
        goalieWorth: 1.1172,
        statWorth: {},
        plusMinusPerMinute: 0,
      },
    ],
  };
}

const ROWS: PlannerTeamRow[] = [
  row('EDM', 1, 3.5, 3),
  row('CGY', 2, 2.1, 4),
  row('BOS', 3, 1.9, 2),
];

describe('TeamSchedulesComponent', () => {
  beforeEach(() => MockBuilder(TeamSchedulesComponent));

  function render() {
    const fixture = MockRender(TeamSchedulesComponent, { rows: ROWS });
    fixture.detectChanges();
    return fixture;
  }

  it('lists the teams best first, one row each', () => {
    const fixture = render();
    const rows = ngMocks.findAll(fixture, 'tbody tr');

    expect(rows.length).toBe(3);
    expect(ngMocks.formatText(rows[0])).toContain('EDM');
    expect(ngMocks.formatText(rows[0])).toContain('3.50');
  });

  it('sorts by a column, most first, and the same column again the other way round', () => {
    const fixture = render();
    const table = fixture.point.componentInstance;

    table.sort('games');
    expect(table.sorted().map((entry) => entry.team)).toEqual(['CGY', 'EDM', 'BOS']);
    expect(table.ariaSort('games')).toBe('descending');

    table.sort('games');
    expect(table.sorted().map((entry) => entry.team)).toEqual(['BOS', 'EDM', 'CGY']);

    table.sort('team');
    expect(table.sorted().map((entry) => entry.team)).toEqual(['BOS', 'CGY', 'EDM']);
  });

  it('keys the colours of the games over the table', () => {
    const fixture = render();

    expect(
      ngMocks.findAll(fixture, '.legend-item').map((item) => ngMocks.formatText(item)),
    ).toEqual(['Favourable opponent', 'Unfavourable opponent']);
  });

  it('opens a team to its games, the colour said in words to a screen reader', () => {
    const fixture = render();
    const table = fixture.point.componentInstance;

    table.toggle('EDM');
    fixture.detectChanges();

    const game = ngMocks.find(fixture, '.game');
    expect(ngMocks.formatText(game)).toContain('at SJS');
    expect(game.attributes['data-tier']).toBe('good');
    expect(ngMocks.formatText(ngMocks.find(game, '.sr-only'))).toBe(', favourable opponent');
    expect(ngMocks.findAll(game, '.game-tag').map((tag) => ngMocks.formatText(tag))).toEqual([
      'B2B',
      'Off',
    ]);

    table.toggle('EDM');
    fixture.detectChanges();
    expect(ngMocks.findAll(fixture, '.game').length).toBe(0);
  });
});
