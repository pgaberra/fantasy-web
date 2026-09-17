import { describe, expect, it } from 'vitest';
import { GoalieProjection, SkaterProjection } from '../../models/projection.model';
import {
  applyImportedStats,
  buildImportPlan,
  linesFromSheet,
  proposeColumnRoles,
} from './spreadsheet-import';
import { PlayerMatcher } from './spreadsheet-players';
import { POOL, lineOf } from './spreadsheet-test-players';
import { Goalie, Skater } from '../../models/player.model';

describe('spreadsheet-import', () => {
  const matcher = new PlayerMatcher(POOL);

  // Laid out like the sheets people share: instructions on top, no heading over the names, and
  // the weighted fantasy-point copies of the stats to the right.
  const rows = [
    ['Enter your weights below.'],
    [null, 'Team', 'GP', 'G', 'A', 'S%', 'ATOI', 'W', 'G', 'A'],
    ['Nathan Mackinnon', 'COL', 82, 44.7, 84.4, 0.111, 22.25, null, 201.15, 253.2],
    ['Tim Stutzle', 'OTT', 80, 31, 50, 0.12, '19:30', null, 1, 1],
    ['Sebastian Aho', null, 80, 30, 40, 0.1, 19, null, 1, 1],
    ['Wayne Gretzky', 'EDM', 82, 90, 120, 0.2, 21, null, 1, 1],
    ['MacKinnon, Nathan', 'COL', 10, 1, 1, 0.1, 10, null, 1, 1],
    ['Igor Shesterkin', 'NYR', 60, 0, 2, null, null, 38, 0, 0],
    [null, null, null, null, null, null, null, null, null, null],
  ];

  it('proposes the names column from the pool when no heading says so', () => {
    const roles = proposeColumnRoles(rows, 1, matcher);
    expect(roles[0]).toEqual({ kind: 'name' });
    expect(roles[1]).toEqual({ kind: 'team' });
    expect(roles.slice(8)).toEqual([null, null]);
  });

  it('reads each matched player once, in stored units, and reports the rest', () => {
    const plan = buildImportPlan(rows, 1, proposeColumnRoles(rows, 1, matcher), matcher);

    expect(plan.rowCount).toBe(6);
    expect(plan.stats.get(1)).toEqual({
      gp: 82,
      goals: 44.7,
      assists: 84.4,
      shPct: 11.1,
      toiPerGame: 1335,
    });
    expect(plan.stats.get(2)?.toiPerGame).toBe(1170);
    expect(plan.notFound).toEqual(['Wayne Gretzky']);
    expect(plan.ambiguous.map((row) => row.name)).toEqual(['Sebastian Aho']);
    expect(plan.ambiguous[0].candidates.map((player) => player.id)).toEqual([4, 5]);
    expect(plan.duplicates).toEqual(['MacKinnon, Nathan']);
  });

  it('imports an ambiguous row once the user picks the player', () => {
    const roles = proposeColumnRoles(rows, 1, matcher);
    const plan = buildImportPlan(rows, 1, roles, matcher, new Map([[2, 5]]));

    expect(plan.stats.get(5)?.goals).toBe(30);
    expect(plan.stats.has(4)).toBe(false);
  });

  it('imports a respelled row unless the user leaves it out', () => {
    const respelledRows = [
      [null, 'Team', 'G'],
      ['Yegor Chinakhov', 'PIT', 25],
    ];
    const roles = proposeColumnRoles(respelledRows, 0, matcher);

    const plan = buildImportPlan(respelledRows, 0, roles, matcher);
    expect(plan.respelled.map((row) => [row.name, row.player.id])).toEqual([
      ['Yegor Chinakhov', 12],
    ]);
    expect(plan.stats.get(12)).toEqual({ goals: 25 });

    const leftOut = buildImportPlan(respelledRows, 0, roles, matcher, new Map([[0, null]]));
    expect(leftOut.stats.has(12)).toBe(false);
  });

  it('builds a whole-pool board where only the named players have numbers', () => {
    const lines = linesFromSheet(POOL, new Map([[9, { gp: 60, w: 38 }]]));

    expect(lines).toHaveLength(POOL.length);
    const goalieLine = lines.find((line) => line.playerId === 9) as GoalieProjection;
    expect(goalieLine.type).toBe('goalie');
    expect(goalieLine.stats.utility.gp).toBe(60);
    expect(goalieLine.stats.scoring.w).toBe(38);
    const skaterLine = lines.find((line) => line.playerId === 1) as SkaterProjection;
    expect(Object.values(skaterLine.stats.scoring).every((value) => value === 0)).toBe(true);
    expect(skaterLine.stats.utility).toEqual({ gp: 0, toiPerGame: 0 });
  });

  it("gives a goalie only a goalie's stats", () => {
    const plan = buildImportPlan(rows, 1, proposeColumnRoles(rows, 1, matcher), matcher);
    expect(plan.stats.get(9)).toEqual({ gp: 60, w: 38 });
  });

  it('writes only the imported stats and never rescales the rest by games played', () => {
    const mackinnon = POOL[0] as Skater;
    const shesterkin = POOL[8] as Goalie;
    const untouched = lineOf(POOL[1] as Skater);
    const projections = [lineOf(mackinnon), untouched, lineOf(shesterkin)];

    const result = applyImportedStats(
      projections,
      new Map([
        [1, { gp: 82, goals: 44.7, toiPerGame: 1335 }],
        [9, { gp: 60, w: 38, hits: 5 }],
      ]),
    );

    const skaterLine = result[0] as SkaterProjection;
    expect(skaterLine.stats.utility).toEqual({ gp: 82, toiPerGame: 1335 });
    expect(skaterLine.stats.scoring.goals).toBeCloseTo(44.7);
    expect(skaterLine.stats.scoring.assists).toBe(mackinnon.stats.scoring.assists);
    expect(result[1]).toBe(untouched);
    const goalieLine = result[2] as GoalieProjection;
    expect(goalieLine.stats.utility).toEqual({ gp: 60 });
    expect(goalieLine.stats.scoring.w).toBe(38);
    expect('hits' in goalieLine.stats.scoring).toBe(false);
  });
});
