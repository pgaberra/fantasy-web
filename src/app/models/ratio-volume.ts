import { GoalieProjection, Projection, SkaterProjection } from './projection.model';
import { RateStatKey } from './stat-key.model';

const SECONDS_PER_HOUR = 60 * 60;

/**
 * How much of a ratio a player carries: the denominator his team's own ratio is summed over. A
 * team's GAA is its goals against over its hours in net, its save percentage its saves over the
 * shots it faced, its win percentage its wins over its decisions and its shooting percentage its
 * goals over its shots. So a goalie moves his team's GAA in proportion to his minutes, and a
 * category ranking has to weigh his rate by them — a 30-game backup's .920 is worth half a
 * 60-game starter's.
 *
 * Every volume is read off the line where it is there and derived from the stats that name it
 * where it is not, since a user's own projection, a spreadsheet import or a Who's Hot split can
 * leave out the minutes or the shots: minutes from goals against and GAA, or a full sixty a game;
 * shots against from saves and save percentage, or from goals against and save percentage. Zero
 * means the line gives nothing to derive a volume from. What the ranking does with such a line is
 * the ranking's business (see `ProjectionCalculationService`).
 */
type VolumeOf<P extends Projection> = (projection: P) => number;

function hoursInNet(projection: GoalieProjection): number {
  const { scoring, utility } = projection.stats;
  if (scoring.toi > 0) {
    return scoring.toi / SECONDS_PER_HOUR;
  }
  if (scoring.ga > 0 && scoring.gaa > 0) {
    return scoring.ga / scoring.gaa;
  }
  return Math.max(0, utility.gp);
}

function shotsAgainst(projection: GoalieProjection): number {
  const { scoring } = projection.stats;
  if (scoring.sa > 0) {
    return scoring.sa;
  }
  if (scoring.sv > 0 && scoring.svPct > 0) {
    return scoring.sv / scoring.svPct;
  }
  const goalsAgainst = scoring.ga > 0 ? scoring.ga : scoring.gaa * hoursInNet(projection);
  // A save percentage of zero next to goals against is a stat that was never filled in, not a
  // goalie who stopped nothing, so it names no shots.
  if (goalsAgainst > 0 && scoring.svPct > 0 && scoring.svPct < 1) {
    return goalsAgainst / (1 - scoring.svPct);
  }
  return 0;
}

function decisions(projection: GoalieProjection): number {
  const { scoring, utility } = projection.stats;
  const decided = scoring.w + scoring.l + scoring.otl;
  if (decided > 0) {
    return decided;
  }
  if (scoring.gs > 0) {
    return scoring.gs;
  }
  return Math.max(0, utility.gp);
}

function shotsOnGoal(projection: SkaterProjection): number {
  const { scoring } = projection.stats;
  if (scoring.sog > 0) {
    return scoring.sog;
  }
  if (scoring.goals > 0 && scoring.shPct > 0) {
    return scoring.goals / (scoring.shPct / 100);
  }
  return 0;
}

const SKATER_RATIO_VOLUMES: Partial<Record<RateStatKey, VolumeOf<SkaterProjection>>> = {
  shPct: shotsOnGoal,
};

const GOALIE_RATIO_VOLUMES: Partial<Record<RateStatKey, VolumeOf<GoalieProjection>>> = {
  gaa: hoursInNet,
  svPct: shotsAgainst,
  winPct: decisions,
};

/**
 * The volume behind `key` for this player, or `null` when `key` is not a ratio of his kind (a
 * counting stat, or a goalie's shooting percentage). Every stat in `RATE_STAT_KEYS` has a volume
 * for one kind of player; the spec holds the two lists to each other.
 */
export function ratioVolume(projection: Projection, key: string): number | null {
  if (projection.type === 'skater') {
    const volumeOf = SKATER_RATIO_VOLUMES[key as RateStatKey];
    return volumeOf ? volumeOf(projection) : null;
  }
  const volumeOf = GOALIE_RATIO_VOLUMES[key as RateStatKey];
  return volumeOf ? volumeOf(projection) : null;
}
