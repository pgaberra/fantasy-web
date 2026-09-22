import { describe, it, expect } from 'vitest';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { leagueProjectionFrom, scoreHeadingFor } from './league-summary-data';

const base: LeagueSummaryResponse = {
  source: 'model',
  premium: true,
  scoringType: 'points',
  status: 'FINISHED',
  picks: 2,
  categoryKeys: ['goals', 'svPct'],
  positionKeys: ['C', 'G', 'BN'],
  teams: [
    {
      teamId: 't1',
      name: 'Mine',
      mine: true,
      total: 120.5,
      values: { goals: 90, svPct: 30.5, C: 90, G: 30.5, BN: 0 },
      roster: [
        {
          playerId: 1,
          name: 'A Skater',
          total: 90,
          values: { goals: 45 },
          contributions: { goals: 90 },
        },
      ],
      positionPlayers: { C: [{ name: 'A Skater', value: 90 }], G: [], BN: [] },
    },
  ],
};

describe('league summary data', () => {
  it('labels the columns the league names, in the league order', () => {
    const projection = leagueProjectionFrom(base);

    expect(projection.categoryColumns.map((column) => column.key)).toEqual(['goals', 'svPct']);
    expect(projection.categoryColumns[0].label).toEqual('Goals');
    expect(projection.positionColumns.map((column) => column.key)).toEqual(['C', 'G', 'BN']);
    expect(projection.positionColumns[2].tooltip).toEqual('Bench');
  });

  /** A points league's totals are written to one decimal, a category league's to two. */
  it("writes the numbers the way the league's own scoring is written", () => {
    expect(leagueProjectionFrom(base).categoryColumns[0].decimals).toEqual(1);
    expect(
      leagueProjectionFrom({ ...base, scoringType: 'category' }).categoryColumns[0].decimals,
    ).toEqual(2);
    expect(scoreHeadingFor(base)).toEqual('Total Points');
    expect(scoreHeadingFor({ ...base, scoringType: 'category' })).toEqual('Z-Score');
  });

  it('keeps the totals and the cells exactly as they came back', () => {
    const team = leagueProjectionFrom(base).teams[0];

    expect(team.total).toEqual(120.5);
    expect(team.values['goals']).toEqual(90);
    expect(team.mine).toBe(true);
  });

  /**
   * Without premium the response carries no players at all. The table has to render the team
   * anyway — the totals are the page — so the halves become empty rather than missing.
   */
  it('renders a team whose players were withheld, with nothing to expand', () => {
    const withheld: LeagueSummaryResponse = {
      ...base,
      premium: false,
      teams: [{ ...base.teams[0], roster: undefined, positionPlayers: undefined }],
    };

    const team = leagueProjectionFrom(withheld).teams[0];

    expect(team.total).toEqual(120.5);
    expect(team.roster).toEqual([]);
    expect(team.positionPlayers).toEqual({});
  });

  /** A goalie has no goals, which is not the same as a goalie who scored none. */
  it('leaves a stat of the other kind out of a roster row rather than zeroing it', () => {
    const team = leagueProjectionFrom(base).teams[0];

    expect(team.roster[0].values['goals']).toEqual(45);
    expect(team.roster[0].values['svPct']).toBeNull();
    expect(team.roster[0].contributions['svPct']).toBeNull();
  });
});
