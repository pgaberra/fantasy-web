import { describe, it, expect } from 'vitest';
import { StatWarningService } from './stat-warning.service';
import {
  GoalieProjection,
  GoalieScoringStats,
  GoalieUtilityStats,
  SkaterProjection,
  SkaterScoringStats,
  SkaterUtilityStats,
} from '../models/projection.model';

const skater = (
  scoring: Partial<SkaterScoringStats> = {},
  utility: Partial<SkaterUtilityStats> = {},
): SkaterProjection => ({
  type: 'skater',
  playerId: 1,
  stats: {
    utility: { gp: 82, toiPerGame: 1200, ...utility },
    scoring: {
      goals: 30,
      assists: 30,
      plusMinus: 0,
      pim: 0,
      ppg: 0,
      ppa: 0,
      ppp: 0,
      shg: 0,
      sha: 0,
      shp: 0,
      gwg: 0,
      sog: 200,
      shPct: 0,
      fw: 0,
      fl: 0,
      hits: 0,
      blocks: 0,
      ...scoring,
    },
  },
});

const goalie = (
  scoring: Partial<GoalieScoringStats> = {},
  utility: Partial<GoalieUtilityStats> = {},
): GoalieProjection => ({
  type: 'goalie',
  playerId: 2,
  stats: {
    utility: { gp: 82, ...utility },
    scoring: { gs: 0, w: 0, l: 0, sho: 0, sa: 100, sv: 0, ga: 0, gaa: 0, svPct: 0, ...scoring },
  },
});

describe('StatWarningService', () => {
  const service = new StatWarningService();

  it('warns when GP exceeds the 82-game season', () => {
    expect(service.warningsFor(skater({}, { gp: 83 })).has('gp')).toEqual(true);
    expect(service.warningsFor(skater({}, { gp: 82 })).has('gp')).toEqual(false);
    expect(service.warningsFor(goalie({}, { gp: 83 })).has('gp')).toEqual(true);
  });

  it('warns when TOI/G exceeds 60 minutes', () => {
    expect(service.warningsFor(skater({}, { toiPerGame: 3601 })).has('toiPerGame')).toEqual(true);
    expect(service.warningsFor(skater({}, { toiPerGame: 3600 })).has('toiPerGame')).toEqual(false);
  });

  it('warns when a goal sub-stat exceeds total goals', () => {
    const warnings = service.warningsFor(skater({ goals: 10, ppg: 11, shg: 11, gwg: 11 }));
    expect(warnings.has('ppg')).toEqual(true);
    expect(warnings.has('shg')).toEqual(true);
    expect(warnings.has('gwg')).toEqual(true);
  });

  it('warns when an assist sub-stat exceeds total assists', () => {
    const warnings = service.warningsFor(skater({ assists: 10, ppa: 11, sha: 11 }));
    expect(warnings.has('ppa')).toEqual(true);
    expect(warnings.has('sha')).toEqual(true);
  });

  it('warns when goals exceed shots on goal', () => {
    expect(service.warningsFor(skater({ goals: 50, sog: 40 })).has('goals')).toEqual(true);
    expect(service.warningsFor(skater({ goals: 30, sog: 200 })).has('goals')).toEqual(false);
  });

  it('warns when PPP / SHP do not equal their goals + assists', () => {
    expect(service.warningsFor(skater({ ppg: 10, ppa: 15, ppp: 25 })).has('ppp')).toEqual(false);
    expect(service.warningsFor(skater({ ppg: 10, ppa: 15, ppp: 20 })).has('ppp')).toEqual(true);
    expect(service.warningsFor(skater({ shg: 2, sha: 3, shp: 5 })).has('shp')).toEqual(false);
    expect(service.warningsFor(skater({ shg: 2, sha: 3, shp: 6 })).has('shp')).toEqual(true);
  });

  it('warns on impossible goalie lines', () => {
    const warnings = service.warningsFor(
      goalie({ gs: 70, w: 40, l: 35, sv: 120, ga: 110, sa: 100 }, { gp: 60 }),
    );
    expect(warnings.has('gs')).toEqual(true);
    expect(warnings.has('w')).toEqual(true);
    expect(warnings.has('l')).toEqual(true);
    expect(warnings.has('sv')).toEqual(true);
    expect(warnings.has('ga')).toEqual(true);
  });

  it('produces no warnings for a plausible line', () => {
    expect(service.warningsFor(skater({})).size).toEqual(0);
    expect(service.warningsFor(goalie({})).size).toEqual(0);
  });
});
