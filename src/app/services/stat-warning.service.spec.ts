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

const DEFAULT_GAMES = 82;
const DEFAULT_TOI_PER_GAME = 1200;

// The line every skater test starts from is deliberately consistent with itself — the derived
// checks compare stats against each other, so a fixture that didn't add up would warn before
// the test changed anything.
const skater = (
  scoring: Partial<SkaterScoringStats> = {},
  utility: Partial<SkaterUtilityStats> = {},
): SkaterProjection => ({
  type: 'skater',
  playerId: 1,
  stats: {
    utility: { gp: DEFAULT_GAMES, toiPerGame: DEFAULT_TOI_PER_GAME, ...utility },
    scoring: {
      stpg: 0,
      stpa: 0,
      stp: 0,
      hatTricks: 0,
      defPoints: 0,
      shifts: 0,
      toi: DEFAULT_GAMES * DEFAULT_TOI_PER_GAME,
      goals: 30,
      assists: 30,
      points: 60,
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
      shPct: 15,
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
    utility: { gp: DEFAULT_GAMES, ...utility },
    scoring: {
      otl: 0,
      winPct: 0,
      toi: 0,
      gs: 0,
      w: 0,
      l: 0,
      sho: 0,
      sa: 0,
      sv: 0,
      ga: 0,
      gaa: 0,
      svPct: 0,
      ...scoring,
    },
  },
});

describe('StatWarningService', () => {
  const service = new StatWarningService();

  it('warns when GP exceeds the 84-game season', () => {
    expect(service.warningsFor(skater({}, { gp: 85 })).has('gp')).toEqual(true);
    expect(service.warningsFor(skater({}, { gp: 84 })).has('gp')).toEqual(false);
    expect(service.warningsFor(goalie({}, { gp: 85 })).has('gp')).toEqual(true);
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

  it('warns when shooting percentage exceeds 100', () => {
    expect(service.warningsFor(skater({ shPct: 101 })).has('shPct')).toEqual(true);
    expect(service.warningsFor(skater({ goals: 30, sog: 30, shPct: 100 })).has('shPct')).toEqual(
      false,
    );
  });

  it('warns when P does not equal goals + assists', () => {
    expect(
      service.warningsFor(skater({ goals: 20, assists: 25, points: 45 })).has('points'),
    ).toEqual(false);
    expect(
      service.warningsFor(skater({ goals: 20, assists: 25, points: 40 })).has('points'),
    ).toEqual(true);
  });

  it('warns when PPP / SHP do not equal their goals + assists', () => {
    expect(service.warningsFor(skater({ ppg: 10, ppa: 15, ppp: 25 })).has('ppp')).toEqual(false);
    expect(service.warningsFor(skater({ ppg: 10, ppa: 15, ppp: 20 })).has('ppp')).toEqual(true);
    expect(service.warningsFor(skater({ shg: 2, sha: 3, shp: 5 })).has('shp')).toEqual(false);
    expect(service.warningsFor(skater({ shg: 2, sha: 3, shp: 6 })).has('shp')).toEqual(true);
  });

  it('warns when special teams stats do not equal power play plus shorthanded', () => {
    const consistent = { ppg: 10, ppa: 15, ppp: 25, shg: 2, sha: 3, shp: 5 };
    const balanced = service.warningsFor(
      skater({ ...consistent, stpg: 12, stpa: 18, stp: 30, goals: 30, assists: 30, points: 60 }),
    );
    expect(balanced.has('stpg')).toEqual(false);
    expect(balanced.has('stpa')).toEqual(false);
    expect(balanced.has('stp')).toEqual(false);

    const warnings = service.warningsFor(
      skater({ ...consistent, stpg: 10, stpa: 18, stp: 40, goals: 30, assists: 30, points: 60 }),
    );
    expect(warnings.get('stpg')).toEqual("Doesn't equal PPG + SHG");
    expect(warnings.has('stpa')).toEqual(false);
    expect(warnings.get('stp')).toEqual("Doesn't equal STPG + STPA");
  });

  it('warns when power play and shorthanded together exceed the total', () => {
    const warnings = service.warningsFor(
      skater({
        goals: 30,
        assists: 30,
        points: 60,
        ppg: 20,
        shg: 15,
        stpg: 35,
        ppa: 20,
        sha: 15,
        stpa: 35,
        ppp: 40,
        shp: 30,
        stp: 70,
      }),
    );
    expect(warnings.get('ppg')).toEqual('PPG + SHG exceed total goals');
    expect(warnings.get('shg')).toEqual('PPG + SHG exceed total goals');
    expect(warnings.get('ppa')).toEqual('PPA + SHA exceed total assists');
    expect(warnings.get('sha')).toEqual('PPA + SHA exceed total assists');
    expect(warnings.get('shp')).toEqual('PPP + SHP exceed total points');
  });

  it('keeps the more specific warning when a stat breaks two rules', () => {
    const warnings = service.warningsFor(skater({ goals: 10, ppg: 11, shg: 5, stpg: 16 }));
    expect(warnings.get('ppg')).toEqual('More than total goals');
  });

  it('warns when hat tricks need more goals than were scored', () => {
    expect(service.warningsFor(skater({ goals: 30, hatTricks: 10 })).has('hatTricks')).toEqual(
      false,
    );
    expect(service.warningsFor(skater({ goals: 30, hatTricks: 11 })).has('hatTricks')).toEqual(
      true,
    );
  });

  it('warns when defencemen points exceed total points', () => {
    expect(service.warningsFor(skater({ defPoints: 60 })).has('defPoints')).toEqual(false);
    expect(service.warningsFor(skater({ defPoints: 61 })).has('defPoints')).toEqual(true);
  });

  it('warns when shooting percentage does not match goals over shots', () => {
    expect(service.warningsFor(skater({ goals: 30, sog: 200, shPct: 15 })).has('shPct')).toEqual(
      false,
    );
    expect(service.warningsFor(skater({ goals: 30, sog: 200, shPct: 12 })).has('shPct')).toEqual(
      true,
    );
    // Nothing to divide by, so the mismatch is left to the goals-over-shots check.
    expect(service.warningsFor(skater({ goals: 0, sog: 0, shPct: 12 })).has('shPct')).toEqual(
      false,
    );
  });

  it('warns when season TOI does not match TOI/G times GP', () => {
    expect(
      service.warningsFor(skater({ toi: 98_400 }, { gp: 82, toiPerGame: 1200 })).has('toi'),
    ).toEqual(false);
    expect(
      service.warningsFor(skater({ toi: 60_000 }, { gp: 82, toiPerGame: 1200 })).has('toi'),
    ).toEqual(true);
    // A season total is rounded against a per-game average reported to the second, so a
    // fraction of a percent is rounding rather than a mistake.
    expect(
      service.warningsFor(skater({ toi: 98_500 }, { gp: 82, toiPerGame: 1200 })).has('toi'),
    ).toEqual(false);
    expect(service.warningsFor(skater({ toi: 0 }, { gp: 0, toiPerGame: 0 })).has('toi')).toEqual(
      false,
    );
    expect(service.warningsFor(skater({ toi: 1200 }, { gp: 0, toiPerGame: 0 })).has('toi')).toEqual(
      true,
    );
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

  it('counts overtime losses among the decisions a goalie can have', () => {
    const warnings = service.warningsFor(goalie({ w: 30, l: 25, otl: 6 }, { gp: 60 }));
    expect(warnings.has('w')).toEqual(true);
    expect(warnings.has('l')).toEqual(true);
    expect(warnings.has('otl')).toEqual(true);
    expect(service.warningsFor(goalie({ w: 30, l: 25, otl: 5 }, { gp: 60 })).has('otl')).toEqual(
      false,
    );
  });

  it('warns when shutouts exceed wins', () => {
    expect(service.warningsFor(goalie({ w: 5, sho: 5 })).has('sho')).toEqual(false);
    expect(service.warningsFor(goalie({ w: 5, sho: 6 })).has('sho')).toEqual(true);
  });

  it('warns when saves + goals against do not equal shots against', () => {
    expect(service.warningsFor(goalie({ sa: 100, sv: 90, ga: 10 })).has('sa')).toEqual(false);
    expect(service.warningsFor(goalie({ sa: 100, sv: 90, ga: 5 })).has('sa')).toEqual(true);
  });

  it('warns when save percentage exceeds 100', () => {
    expect(service.warningsFor(goalie({ svPct: 101 })).has('svPct')).toEqual(true);
    expect(service.warningsFor(goalie({ svPct: 100 })).has('svPct')).toEqual(false);
  });

  it('warns when save percentage does not match saves over shots against', () => {
    expect(
      service.warningsFor(goalie({ sa: 100, sv: 90, ga: 10, svPct: 0.9 })).has('svPct'),
    ).toEqual(false);
    expect(
      service.warningsFor(goalie({ sa: 100, sv: 90, ga: 10, svPct: 0.85 })).has('svPct'),
    ).toEqual(true);
  });

  it('warns when win percentage does not match the decisions', () => {
    expect(
      service.warningsFor(goalie({ w: 30, l: 10, otl: 10, winPct: 0.6 })).has('winPct'),
    ).toEqual(false);
    expect(
      service.warningsFor(goalie({ w: 30, l: 10, otl: 10, winPct: 0.5 })).has('winPct'),
    ).toEqual(true);
    expect(service.warningsFor(goalie({ winPct: 0.5 })).has('winPct')).toEqual(false);
  });

  it('warns when GAA does not match goals against over the ice time', () => {
    expect(
      service.warningsFor(goalie({ toi: 36_000, ga: 25, sa: 25, gaa: 2.5 })).has('gaa'),
    ).toEqual(false);
    expect(
      service.warningsFor(goalie({ toi: 36_000, ga: 25, sa: 25, gaa: 3.5 })).has('gaa'),
    ).toEqual(true);
    // Time on ice comes from a source that doesn't cover every goalie; without it there is
    // nothing to check GAA against.
    expect(service.warningsFor(goalie({ toi: 0, ga: 25, sa: 25, gaa: 3.5 })).has('gaa')).toEqual(
      false,
    );
  });

  it('warns when a goalie has more ice time than their games allow', () => {
    expect(service.warningsFor(goalie({ toi: 3900 }, { gp: 1 })).has('toi')).toEqual(false);
    expect(service.warningsFor(goalie({ toi: 3901 }, { gp: 1 })).has('toi')).toEqual(true);
    expect(service.warningsFor(goalie({ toi: 1200 }, { gp: 0 })).has('toi')).toEqual(true);
  });

  it('produces no warnings for a plausible line', () => {
    expect(service.warningsFor(skater({})).size).toEqual(0);
    expect(service.warningsFor(goalie({})).size).toEqual(0);
  });

  describe("a team's goalie starts", () => {
    // 40 of the team's 84, so the goalie's own line never warns and only the team total can.
    const shareOfTheNet = goalie({ gs: 40 }, { gp: 45 });

    it('says nothing without a team total to compare against', () => {
      expect(service.warningsFor(shareOfTheNet).has('gs')).toEqual(false);
      expect(service.warningsFor(shareOfTheNet, null).has('gs')).toEqual(false);
    });

    it('says nothing when the team adds up to the schedule', () => {
      expect(service.warningsFor(shareOfTheNet, 84).has('gs')).toEqual(false);
    });

    it('says nothing when the team falls short', () => {
      // Ordinary: a goalie the pool does not carry contributes nothing to the total.
      expect(service.warningsFor(shareOfTheNet, 61).has('gs')).toEqual(false);
    });

    it('allows half a game of rounding either side', () => {
      expect(service.warningsFor(shareOfTheNet, 84.4).has('gs')).toEqual(false);
      expect(service.warningsFor(shareOfTheNet, 84.6).has('gs')).toEqual(true);
    });

    it('names the total when the team starts more games than it plays', () => {
      expect(service.warningsFor(shareOfTheNet, 88.42).get('gs')).toEqual(
        "This team's goalies start 88.4 games between them, more than the 84 it plays",
      );
    });

    it("leaves the goalie's own contradiction in front of the team's", () => {
      // More starts than games played is the more specific fault and the one he can fix here.
      expect(service.warningsFor(goalie({ gs: 50 }, { gp: 45 }), 88).get('gs')).toEqual(
        'More than games played',
      );
    });
  });
});
