import { Injectable } from '@angular/core';
import {
  ActiveColumns,
  GoalieProjection,
  Projection,
  SkaterProjection,
} from '../models/projection.model';
import { StatKey } from '../models/stat-key.model';
import { FULL_SEASON_GAMES } from '../draft-projection/projection-defaults';

const SECONDS_PER_HOUR = 60 * 60;
const MAX_TOI_SECONDS = SECONDS_PER_HOUR;
const MAX_PERCENTAGE = 100;
const POINTS_TOLERANCE = 0.01;
const GOALS_PER_HAT_TRICK = 3;

/**
 * A goalie has no TOI/G to check a season total against, so the bound is what a game can
 * hold: 60 minutes plus an overtime that never reaches five.
 */
const MAX_GOALIE_TOI_PER_GAME_SECONDS = 65 * 60;

/**
 * Derived stats are only ever as exact as the numbers they were rounded to, so each
 * comparison allows the rounding its source uses:
 *
 * - **TOI.** TOI/G is reported to the second and the season total comes from ESPN rather than
 *   from TOI/G × GP, so the two never agree exactly. Across the current player pool all but a
 *   handful land within 0.2%, which leaves 2% (or a minute, whichever is larger) far enough
 *   out that only an edit gone out of step reaches it.
 * - **GAA.** Rounded to two decimals, and measured against the same ESPN time on ice.
 * - **SH%** is carried as a percentage rounded to one decimal; **SV%** and **W%** are carried
 *   as fractions rounded to three.
 */
const TOI_RELATIVE_TOLERANCE = 0.02;
const TOI_MIN_TOLERANCE_SECONDS = 60;
const GAA_RELATIVE_TOLERANCE = 0.02;
const GAA_MIN_TOLERANCE = 0.05;
const PERCENTAGE_TOLERANCE = 0.1;
const FRACTION_TOLERANCE = 0.005;

/**
 * How far a stat may sit over its bound before it counts as over it. Parts that add up to
 * exactly their whole can still sum a hair past it in floating point: the AI projection serves
 * a goalie who starts every game he plays with W + L + OTL equal to his GP, and in about one
 * such line in seven the three come to 1e-14 more. A strict `>` flagged every one of them
 * (Edmonton's crease, 2026-09-24). A millionth is far below the one decimal a stat is shown to
 * and far above any rounding a season total carries.
 */
const BOUND_TOLERANCE = 1e-6;

/** Whether every stat a rule reads is a column of this projection. */
type ActiveCheck = (...keys: StatKey[]) => boolean;

@Injectable({
  providedIn: 'root',
})
export class StatWarningService {
  /**
   * A rule is checked only when every stat it reads is an active column. A stat the projection
   * doesn't count is never shown, so a projection with PPP but not PPG or PPA must not flag its
   * PPP against two numbers nobody can see or edit.
   */
  warningsFor(projection: Projection, activeColumns: ActiveColumns): Map<StatKey, string> {
    const warnings = new Map<StatKey, string>();
    const active = new Set<StatKey>([...activeColumns.utility, ...activeColumns.scoring]);
    const on: ActiveCheck = (...keys) => keys.every((key) => active.has(key));

    if (on('gp') && this.exceeds(projection.stats.utility.gp, FULL_SEASON_GAMES)) {
      this.warn(warnings, 'gp', `Projected beyond the ${FULL_SEASON_GAMES}-game season`);
    }

    if (projection.type === 'skater') {
      this.addSkaterWarnings(projection, warnings, on);
    } else {
      this.addGoalieWarnings(projection, warnings, on);
    }

    return warnings;
  }

  private addSkaterWarnings(
    projection: SkaterProjection,
    warnings: Map<StatKey, string>,
    on: ActiveCheck,
  ): void {
    const { scoring, utility } = projection.stats;

    if (on('toiPerGame') && this.exceeds(utility.toiPerGame, MAX_TOI_SECONDS)) {
      this.warn(warnings, 'toiPerGame', 'Over 60 minutes per game');
    }
    if (on('ppg', 'goals') && this.exceeds(scoring.ppg, scoring.goals)) {
      this.warn(warnings, 'ppg', 'More than total goals');
    }
    if (on('shg', 'goals') && this.exceeds(scoring.shg, scoring.goals)) {
      this.warn(warnings, 'shg', 'More than total goals');
    }
    if (on('gwg', 'goals') && this.exceeds(scoring.gwg, scoring.goals)) {
      this.warn(warnings, 'gwg', 'More than total goals');
    }
    if (on('ppa', 'assists') && this.exceeds(scoring.ppa, scoring.assists)) {
      this.warn(warnings, 'ppa', 'More than total assists');
    }
    if (on('sha', 'assists') && this.exceeds(scoring.sha, scoring.assists)) {
      this.warn(warnings, 'sha', 'More than total assists');
    }
    if (on('defPoints', 'points') && this.exceeds(scoring.defPoints, scoring.points)) {
      this.warn(warnings, 'defPoints', 'More than total points');
    }
    if (on('goals', 'sog') && this.exceeds(scoring.goals, scoring.sog)) {
      this.warn(warnings, 'goals', 'More goals than shots on goal');
    }
    if (
      on('hatTricks', 'goals') &&
      this.exceeds(scoring.hatTricks * GOALS_PER_HAT_TRICK, scoring.goals)
    ) {
      this.warn(warnings, 'hatTricks', 'Needs three goals each');
    }

    // Every goal, assist and point is scored at even strength, on the power play or
    // shorthanded, so the special teams share can never be more than the whole.
    if (on('ppg', 'shg', 'goals') && this.exceeds(scoring.ppg + scoring.shg, scoring.goals)) {
      this.warn(warnings, 'ppg', 'PPG + SHG exceed total goals');
      this.warn(warnings, 'shg', 'PPG + SHG exceed total goals');
    }
    if (on('ppa', 'sha', 'assists') && this.exceeds(scoring.ppa + scoring.sha, scoring.assists)) {
      this.warn(warnings, 'ppa', 'PPA + SHA exceed total assists');
      this.warn(warnings, 'sha', 'PPA + SHA exceed total assists');
    }
    if (on('ppp', 'shp', 'points') && this.exceeds(scoring.ppp + scoring.shp, scoring.points)) {
      this.warn(warnings, 'ppp', 'PPP + SHP exceed total points');
      this.warn(warnings, 'shp', 'PPP + SHP exceed total points');
    }

    if (
      on('goals', 'assists', 'points') &&
      this.differs(scoring.goals + scoring.assists, scoring.points, POINTS_TOLERANCE)
    ) {
      this.warn(warnings, 'points', "Doesn't equal Goals + Assists");
    }
    if (
      on('ppg', 'ppa', 'ppp') &&
      this.differs(scoring.ppg + scoring.ppa, scoring.ppp, POINTS_TOLERANCE)
    ) {
      this.warn(warnings, 'ppp', "Doesn't equal PPG + PPA");
    }
    if (
      on('shg', 'sha', 'shp') &&
      this.differs(scoring.shg + scoring.sha, scoring.shp, POINTS_TOLERANCE)
    ) {
      this.warn(warnings, 'shp', "Doesn't equal SHG + SHA");
    }

    // Special teams is the power play and the penalty kill counted as one category.
    if (
      on('ppg', 'shg', 'stpg') &&
      this.differs(scoring.ppg + scoring.shg, scoring.stpg, POINTS_TOLERANCE)
    ) {
      this.warn(warnings, 'stpg', "Doesn't equal PPG + SHG");
    }
    if (
      on('ppa', 'sha', 'stpa') &&
      this.differs(scoring.ppa + scoring.sha, scoring.stpa, POINTS_TOLERANCE)
    ) {
      this.warn(warnings, 'stpa', "Doesn't equal PPA + SHA");
    }
    if (
      on('stpg', 'stpa', 'stp') &&
      this.differs(scoring.stpg + scoring.stpa, scoring.stp, POINTS_TOLERANCE)
    ) {
      this.warn(warnings, 'stp', "Doesn't equal STPG + STPA");
    }

    if (on('shPct') && this.exceeds(scoring.shPct, MAX_PERCENTAGE)) {
      this.warn(warnings, 'shPct', 'Over 100%');
    }
    if (
      on('goals', 'sog', 'shPct') &&
      scoring.sog > 0 &&
      this.differs(
        (scoring.goals / scoring.sog) * MAX_PERCENTAGE,
        scoring.shPct,
        PERCENTAGE_TOLERANCE,
      )
    ) {
      this.warn(warnings, 'shPct', "Doesn't match Goals / SOG");
    }

    const seasonToi = utility.gp * utility.toiPerGame;
    if (
      on('gp', 'toiPerGame', 'toi') &&
      this.differs(seasonToi, scoring.toi, this.toiTolerance(seasonToi))
    ) {
      this.warn(warnings, 'toi', "Doesn't equal TOI/G × GP");
    }
  }

  private addGoalieWarnings(
    projection: GoalieProjection,
    warnings: Map<StatKey, string>,
    on: ActiveCheck,
  ): void {
    const { scoring, utility } = projection.stats;
    const decisions = scoring.w + scoring.l + scoring.otl;

    if (on('gs', 'gp') && this.exceeds(scoring.gs, utility.gp)) {
      this.warn(warnings, 'gs', 'More than games played');
    }
    if (on('w', 'l', 'otl', 'gp') && this.exceeds(decisions, utility.gp)) {
      const message = 'Wins + losses + OT losses exceed games played';
      this.warn(warnings, 'w', message);
      this.warn(warnings, 'l', message);
      this.warn(warnings, 'otl', message);
    }
    if (on('sho', 'w') && this.exceeds(scoring.sho, scoring.w)) {
      this.warn(warnings, 'sho', 'More than wins');
    }
    if (on('sv', 'sa') && this.exceeds(scoring.sv, scoring.sa)) {
      this.warn(warnings, 'sv', 'More than shots against');
    }
    if (on('ga', 'sa') && this.exceeds(scoring.ga, scoring.sa)) {
      this.warn(warnings, 'ga', 'More than shots against');
    }
    if (
      on('sv', 'ga', 'sa') &&
      this.differs(scoring.sv + scoring.ga, scoring.sa, POINTS_TOLERANCE)
    ) {
      this.warn(warnings, 'sa', "Doesn't equal Saves + Goals against");
    }

    if (on('svPct') && this.exceeds(scoring.svPct, MAX_PERCENTAGE)) {
      this.warn(warnings, 'svPct', 'Over 100%');
    }
    // Save and win percentage are both carried as a fraction of one, the way they are shown.
    if (
      on('sv', 'sa', 'svPct') &&
      scoring.sa > 0 &&
      this.differs(scoring.sv / scoring.sa, scoring.svPct, FRACTION_TOLERANCE)
    ) {
      this.warn(warnings, 'svPct', "Doesn't match Saves / Shots against");
    }
    if (
      on('w', 'l', 'otl', 'winPct') &&
      decisions > 0 &&
      this.differs(scoring.w / decisions, scoring.winPct, FRACTION_TOLERANCE)
    ) {
      this.warn(warnings, 'winPct', "Doesn't match Wins / Decisions");
    }

    if (
      on('toi', 'gp') &&
      this.exceeds(scoring.toi, utility.gp * MAX_GOALIE_TOI_PER_GAME_SECONDS)
    ) {
      this.warn(warnings, 'toi', 'More ice time than games played allows');
    }
    if (on('ga', 'toi', 'gaa') && scoring.toi > 0) {
      const goalsPer60 = (scoring.ga * SECONDS_PER_HOUR) / scoring.toi;
      if (this.differs(goalsPer60, scoring.gaa, this.gaaTolerance(goalsPer60))) {
        this.warn(warnings, 'gaa', "Doesn't match Goals against per 60 minutes");
      }
    }
  }

  /** The first warning on a stat is the most specific one, so it is the one kept. */
  private warn(warnings: Map<StatKey, string>, key: StatKey, message: string): void {
    if (!warnings.has(key)) {
      warnings.set(key, message);
    }
  }

  /** Over its bound by more than a floating-point rounding. See `BOUND_TOLERANCE`. */
  private exceeds(value: number, bound: number): boolean {
    return value - bound > BOUND_TOLERANCE;
  }

  private differs(expected: number, actual: number, tolerance: number): boolean {
    return Math.abs(expected - actual) > tolerance;
  }

  private toiTolerance(expectedSeconds: number): number {
    return Math.max(TOI_MIN_TOLERANCE_SECONDS, expectedSeconds * TOI_RELATIVE_TOLERANCE);
  }

  private gaaTolerance(expected: number): number {
    return Math.max(GAA_MIN_TOLERANCE, expected * GAA_RELATIVE_TOLERANCE);
  }
}
