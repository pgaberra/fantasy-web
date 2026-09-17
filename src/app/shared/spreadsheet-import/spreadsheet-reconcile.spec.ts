import { describe, expect, it } from 'vitest';
import { StatKey } from '../../models/stat-key.model';
import { StatWarningService } from '../../services/stat-warning.service';
import { GoalieProjection, SkaterProjection } from '../../models/projection.model';
import { applyImportedStats, ImportedStats } from './spreadsheet-import';
import { reconcileImportedLine } from './spreadsheet-reconcile';
import { goalie, lineOf, skater } from './spreadsheet-test-players';

describe('spreadsheet-reconcile', () => {
  const warnings = new StatWarningService();

  /** A skater whose line holds together before the import, as a pool line does. */
  const consistentSkater = () => {
    const player = skater(1, 'A Skater');
    Object.assign(player.stats.scoring, {
      goals: 20,
      assists: 30,
      points: 50,
      ppg: 6,
      ppa: 10,
      ppp: 16,
      shg: 1,
      sha: 1,
      shp: 2,
      stpg: 7,
      stpa: 11,
      stp: 18,
      sog: 200,
      shPct: 10,
      toi: 70 * 1000,
    });
    return lineOf(player);
  };

  const importInto = (line: SkaterProjection, stats: ImportedStats) =>
    applyImportedStats([line], new Map([[1, stats]]))[0] as SkaterProjection;

  it('leaves no warning behind for a rounded sheet that gives goals, assists and points', () => {
    const result = importInto(consistentSkater(), {
      goals: 44.7,
      assists: 84.4,
      points: 129.2,
      ppp: 43.3,
      sog: 402.3,
      shPct: 11.1,
      gp: 82,
      toiPerGame: 1335,
    });

    expect(result.stats.scoring.points).toBeCloseTo(129.1);
    expect(result.stats.scoring.ppg + result.stats.scoring.ppa).toBeCloseTo(43.3);
    expect(warnings.warningsFor(result).size).toBe(0);
  });

  it('splits an imported total the way the line already split it', () => {
    const result = importInto(consistentSkater(), { ppp: 32 });

    // 6 PPG and 10 PPA doubled keep their 6:10 split.
    expect(result.stats.scoring.ppg).toBeCloseTo(12);
    expect(result.stats.scoring.ppa).toBeCloseTo(20);
    // Special teams follows: 32 on the power play and 2 shorthanded.
    expect(result.stats.scoring.stp).toBeCloseTo(34);
  });

  it("splits a power-play total the line had none of the way the player's points split", () => {
    const line = consistentSkater();
    Object.assign(line.stats.scoring, { ppg: 0, ppa: 0, ppp: 0, stpg: 1, stpa: 1, stp: 2 });
    const result = importInto(line, { goals: 40, assists: 60, points: 100, ppp: 30 });

    expect(result.stats.scoring.ppg).toBeCloseTo(12);
    expect(result.stats.scoring.ppa).toBeCloseTo(18);
    expect(warnings.warningsFor(result).size).toBe(0);
  });

  it("moves a defenceman's points with his points", () => {
    const line = consistentSkater();
    line.stats.scoring.defPoints = 50;
    const result = importInto(line, { goals: 10, assists: 20 });

    expect(result.stats.scoring.defPoints).toBeCloseTo(30);
  });

  it('gives the part the sheet left out whatever the total leaves', () => {
    const result = importInto(consistentSkater(), { points: 60, goals: 25 });

    expect(result.stats.scoring.assists).toBe(35);
    expect(result.stats.scoring.points).toBe(60);
  });

  it('adds up parts the sheet gives without their total', () => {
    const result = importInto(consistentSkater(), { goals: 30 });

    expect(result.stats.scoring.points).toBe(60);
    expect(result.stats.scoring.shPct).toBeCloseTo(15);
  });

  it('names the shots from a shooting percentage when the sheet gives no shots', () => {
    const result = importInto(consistentSkater(), { goals: 30, shPct: 12 });

    expect(result.stats.scoring.sog).toBeCloseTo(250);
  });

  it('leaves a total alone when the line has no split to scale', () => {
    const scoring: Record<string, number> = { points: 10, goals: 0, assists: 0 };
    reconcileImportedLine('skater', scoring, { gp: 0, toiPerGame: 0 }, new Set(['points']), {
      scoring: { ...scoring },
      gp: 0,
    });

    expect(scoring).toMatchObject({ points: 10, goals: 0, assists: 0 });
  });

  it('squares a goalie from wins, GAA and save percentage alone', () => {
    const player = goalie(9, 'A Goalie');
    Object.assign(player.stats.scoring, {
      w: 25,
      l: 15,
      otl: 5,
      sa: 1500,
      sv: 1365,
      ga: 135,
      svPct: 0.91,
      gaa: 2.7,
      toi: 50 * 3600,
      winPct: 25 / 45,
    });
    const imported = new Map<number, ImportedStats>([
      [9, { gp: 60, w: 38, l: 15, otl: 5, gaa: 2.5, svPct: 0.915 }],
    ]);

    const result = applyImportedStats([lineOf(player)], imported)[0] as GoalieProjection;

    expect(result.stats.scoring.toi).toBe(60 * 3600);
    expect(result.stats.scoring.ga).toBeCloseTo(150);
    expect(result.stats.scoring.gaa).toBeCloseTo(2.5);
    expect(result.stats.scoring.svPct).toBeCloseTo(0.915);
    expect(warnings.warningsFor(result).size).toBe(0);
  });

  it('touches nothing the sheet did not reach', () => {
    const line = consistentSkater();
    const scoring = { ...line.stats.scoring } as Record<string, number>;
    reconcileImportedLine('skater', scoring, { ...line.stats.utility }, new Set<StatKey>(), {
      scoring: line.stats.scoring,
      gp: 70,
    });

    expect(scoring).toEqual(line.stats.scoring);
  });
});
