import { Injectable } from '@angular/core';
import { GoalieProjection, Projection, SkaterProjection } from '../models/projection.model';
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
/**
 * A team's goalies share one net, so the projection model divides the schedule between them and
 * their games started add up to exactly it. Only an *excess* is flagged: a team can never start
 * more games than it plays, while falling short is ordinary (a goalie the pool doesn't carry
 * contributes nothing). Half a game of slack keeps rounding out of it.
 */
const TEAM_STARTS_TOLERANCE = 0.5;

const TOI_RELATIVE_TOLERANCE = 0.02;
const TOI_MIN_TOLERANCE_SECONDS = 60;
const GAA_RELATIVE_TOLERANCE = 0.02;
const GAA_MIN_TOLERANCE = 0.05;
const PERCENTAGE_TOLERANCE = 0.1;
const FRACTION_TOLERANCE = 0.005;

@Injectable({
  providedIn: 'root',
})
export class StatWarningService {
  /**
   * `teamGoalieStarts` is the games started by every goalie on this player's team, or null when
   * there is no trustworthy total to compare against. It is the caller's job to decide that:
   * the check is only as good as the team a player is shown on, and that label comes from the
   * cached player pool.
   */
  warningsFor(
    projection: Projection,
    teamGoalieStarts: number | null = null,
  ): Map<StatKey, string> {
    const warnings = new Map<StatKey, string>();

    if (projection.stats.utility.gp > FULL_SEASON_GAMES) {
      this.warn(warnings, 'gp', `Projected over the ${FULL_SEASON_GAMES}-game season`);
    }

    if (projection.type === 'skater') {
      this.addSkaterWarnings(projection, warnings);
    } else {
      this.addGoalieWarnings(projection, warnings, teamGoalieStarts);
    }

    return warnings;
  }

  private addSkaterWarnings(projection: SkaterProjection, warnings: Map<StatKey, string>): void {
    const { scoring, utility } = projection.stats;

    if (utility.toiPerGame > MAX_TOI_SECONDS) {
      this.warn(warnings, 'toiPerGame', 'Over 60 minutes per game');
    }
    if (scoring.ppg > scoring.goals) {
      this.warn(warnings, 'ppg', 'More than total goals');
    }
    if (scoring.shg > scoring.goals) {
      this.warn(warnings, 'shg', 'More than total goals');
    }
    if (scoring.gwg > scoring.goals) {
      this.warn(warnings, 'gwg', 'More than total goals');
    }
    if (scoring.ppa > scoring.assists) {
      this.warn(warnings, 'ppa', 'More than total assists');
    }
    if (scoring.sha > scoring.assists) {
      this.warn(warnings, 'sha', 'More than total assists');
    }
    if (scoring.defPoints > scoring.points) {
      this.warn(warnings, 'defPoints', 'More than total points');
    }
    if (scoring.goals > scoring.sog) {
      this.warn(warnings, 'goals', 'More goals than shots on goal');
    }
    if (scoring.hatTricks * GOALS_PER_HAT_TRICK > scoring.goals) {
      this.warn(warnings, 'hatTricks', 'Needs three goals each');
    }

    // Every goal, assist and point is scored at even strength, on the power play or
    // shorthanded, so the special teams share can never be more than the whole.
    if (scoring.ppg + scoring.shg > scoring.goals) {
      this.warn(warnings, 'ppg', 'PPG + SHG exceed total goals');
      this.warn(warnings, 'shg', 'PPG + SHG exceed total goals');
    }
    if (scoring.ppa + scoring.sha > scoring.assists) {
      this.warn(warnings, 'ppa', 'PPA + SHA exceed total assists');
      this.warn(warnings, 'sha', 'PPA + SHA exceed total assists');
    }
    if (scoring.ppp + scoring.shp > scoring.points) {
      this.warn(warnings, 'ppp', 'PPP + SHP exceed total points');
      this.warn(warnings, 'shp', 'PPP + SHP exceed total points');
    }

    if (this.differs(scoring.goals + scoring.assists, scoring.points, POINTS_TOLERANCE)) {
      this.warn(warnings, 'points', "Doesn't equal Goals + Assists");
    }
    if (this.differs(scoring.ppg + scoring.ppa, scoring.ppp, POINTS_TOLERANCE)) {
      this.warn(warnings, 'ppp', "Doesn't equal PPG + PPA");
    }
    if (this.differs(scoring.shg + scoring.sha, scoring.shp, POINTS_TOLERANCE)) {
      this.warn(warnings, 'shp', "Doesn't equal SHG + SHA");
    }

    // Special teams is the power play and the penalty kill counted as one category.
    if (this.differs(scoring.ppg + scoring.shg, scoring.stpg, POINTS_TOLERANCE)) {
      this.warn(warnings, 'stpg', "Doesn't equal PPG + SHG");
    }
    if (this.differs(scoring.ppa + scoring.sha, scoring.stpa, POINTS_TOLERANCE)) {
      this.warn(warnings, 'stpa', "Doesn't equal PPA + SHA");
    }
    if (this.differs(scoring.stpg + scoring.stpa, scoring.stp, POINTS_TOLERANCE)) {
      this.warn(warnings, 'stp', "Doesn't equal STPG + STPA");
    }

    if (scoring.shPct > MAX_PERCENTAGE) {
      this.warn(warnings, 'shPct', 'Over 100%');
    }
    if (
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
    if (this.differs(seasonToi, scoring.toi, this.toiTolerance(seasonToi))) {
      this.warn(warnings, 'toi', "Doesn't equal TOI/G × GP");
    }
  }

  private addGoalieWarnings(
    projection: GoalieProjection,
    warnings: Map<StatKey, string>,
    teamGoalieStarts: number | null,
  ): void {
    const { scoring, utility } = projection.stats;
    const decisions = scoring.w + scoring.l + scoring.otl;

    if (scoring.gs > utility.gp) {
      this.warn(warnings, 'gs', 'More than games played');
    }
    if (teamGoalieStarts !== null && teamGoalieStarts > FULL_SEASON_GAMES + TEAM_STARTS_TOLERANCE) {
      const total = Math.round(teamGoalieStarts * 10) / 10;
      this.warn(
        warnings,
        'gs',
        `This team's goalies start ${total} games between them, more than the ` +
          `${FULL_SEASON_GAMES} it plays`,
      );
    }
    if (decisions > utility.gp) {
      const message = 'Wins + losses + OT losses exceed games played';
      this.warn(warnings, 'w', message);
      this.warn(warnings, 'l', message);
      this.warn(warnings, 'otl', message);
    }
    if (scoring.sho > scoring.w) {
      this.warn(warnings, 'sho', 'More than wins');
    }
    if (scoring.sv > scoring.sa) {
      this.warn(warnings, 'sv', 'More than shots against');
    }
    if (scoring.ga > scoring.sa) {
      this.warn(warnings, 'ga', 'More than shots against');
    }
    if (this.differs(scoring.sv + scoring.ga, scoring.sa, POINTS_TOLERANCE)) {
      this.warn(warnings, 'sa', "Doesn't equal Saves + Goals against");
    }

    if (scoring.svPct > MAX_PERCENTAGE) {
      this.warn(warnings, 'svPct', 'Over 100%');
    }
    // Save and win percentage are both carried as a fraction of one, the way they are shown.
    if (
      scoring.sa > 0 &&
      this.differs(scoring.sv / scoring.sa, scoring.svPct, FRACTION_TOLERANCE)
    ) {
      this.warn(warnings, 'svPct', "Doesn't match Saves / Shots against");
    }
    if (decisions > 0 && this.differs(scoring.w / decisions, scoring.winPct, FRACTION_TOLERANCE)) {
      this.warn(warnings, 'winPct', "Doesn't match Wins / Decisions");
    }

    if (scoring.toi > utility.gp * MAX_GOALIE_TOI_PER_GAME_SECONDS) {
      this.warn(warnings, 'toi', 'More ice time than games played allows');
    }
    if (scoring.toi > 0) {
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
