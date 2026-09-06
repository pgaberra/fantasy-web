import { Injectable } from '@angular/core';
import {
  GoalieProjection,
  GoalieScoringStats,
  Projection,
  SkaterProjection,
  SkaterScoringStats,
} from '../models/projection.model';
import { ScaleConfig } from '../draft-projection/projection-settings-section/model';
import { FULL_SEASON_GAMES, PREVIOUS_SEASON_GAMES } from '../draft-projection/projection-defaults';
import {
  GOALIE_SCORING_STAT_KEYS,
  GoalieStatKey,
  SKATER_SCORING_STAT_KEYS,
  SkaterStatKey,
  SkaterUtilityStatKey,
  ScoringStatKey,
  StatKey,
} from '../models/stat-key.model';

@Injectable({
  providedIn: 'root',
})
export class ProjectionUpdateService {
  applyToiDelta(
    projections: Projection[],
    playerId: number,
    delta: number,
    scaleSettings: Record<SkaterUtilityStatKey, ScaleConfig>,
  ): Projection[] {
    return projections.map((pp) => {
      if (pp.playerId !== playerId || !this.isSkaterProjection(pp)) return pp;
      const oldToi = pp.stats.utility.toiPerGame;
      const newToi = Math.max(0, oldToi + delta);
      const toiSettings = scaleSettings.toiPerGame;
      const shouldScale = toiSettings.scale && oldToi > 0;
      const scoring = shouldScale
        ? this.scaleSkaterScoring(pp.stats.scoring, newToi / oldToi, toiSettings.scalableStats)
        : pp.stats.scoring;
      return {
        ...pp,
        stats: { ...pp.stats, scoring, utility: { ...pp.stats.utility, toiPerGame: newToi } },
      };
    });
  }

  applyStatValue(
    projections: Projection[],
    playerId: number,
    key: StatKey,
    value: number,
    scaleSettings: Record<SkaterUtilityStatKey, ScaleConfig>,
  ): Projection[] {
    return projections.map((pp) => {
      if (pp.playerId !== playerId) return pp;
      if (this.isSkaterProjection(pp)) {
        return this.applySkaterStatValue(pp, key as SkaterStatKey, value, scaleSettings);
      }
      return this.applyGoalieStatValue(pp, key as GoalieStatKey, value, scaleSettings);
    });
  }

  /**
   * One-click "full season" bulk edit: sets every skater's games played to a full 84-game
   * season. When scaleStats is on, each player's scalable scoring stats are rescaled by the
   * same games ratio the existing per-stat edit path uses — but only for players who already
   * played at least minGamesToScale games, so a tiny sample (e.g. 1 GP, 1 goal) isn't
   * blown up into a full-season line. A single pass so it stays O(n) over the projections.
   *
   * **Goalies are left alone unless scaleGoalies says otherwise**, and that is off by default.
   * The ×84/82 it applies assumes the line in front of it came from an 82-game season, which is
   * true of last season's stats and false of the AI projection — that one is already projected
   * over 84 games, and scaling it again inflates every goalie by about 2%. It also breaks an
   * invariant the model holds on purpose: a team's goalies share one net, so their games started
   * add up to exactly the schedule, and a blanket ×84/82 pushes the total past it.
   */
  applyFullSeasonGames(
    projections: Projection[],
    scaleSettings: Record<SkaterUtilityStatKey, ScaleConfig>,
    scaleStats: boolean,
    minGamesToScale: number,
    scaleGoalies = false,
  ): Projection[] {
    const settings = scaleSettings.gp;
    return projections.map((projection) => {
      if (projection.type === 'goalie' && !scaleGoalies) return projection;
      const oldGp = projection.stats.utility.gp;
      const newGp =
        projection.type === 'skater'
          ? FULL_SEASON_GAMES
          : Math.round((oldGp * FULL_SEASON_GAMES) / PREVIOUS_SEASON_GAMES);
      const shouldScale = scaleStats && oldGp >= minGamesToScale && oldGp > 0;
      const ratio = newGp / oldGp;
      if (projection.type === 'skater') {
        const scoring = shouldScale
          ? this.scaleSkaterScoring(projection.stats.scoring, ratio, settings.scalableStats)
          : projection.stats.scoring;
        return {
          ...projection,
          stats: {
            ...projection.stats,
            scoring,
            utility: { ...projection.stats.utility, gp: newGp },
          },
        };
      }
      const scoring = shouldScale
        ? this.scaleGoalieScoring(projection.stats.scoring, ratio, settings.scalableStats)
        : projection.stats.scoring;
      return {
        ...projection,
        stats: {
          ...projection.stats,
          scoring,
          utility: { ...projection.stats.utility, gp: newGp },
        },
      };
    });
  }

  private applySkaterStatValue(
    projection: SkaterProjection,
    key: SkaterStatKey,
    value: number,
    scaleSettings: Record<SkaterUtilityStatKey, ScaleConfig>,
  ): SkaterProjection {
    const isScoring = (SKATER_SCORING_STAT_KEYS as readonly string[]).includes(key);
    if (isScoring) {
      return {
        ...projection,
        stats: { ...projection.stats, scoring: { ...projection.stats.scoring, [key]: value } },
      };
    }
    const utilityKey = key as SkaterUtilityStatKey;
    const oldValue = projection.stats.utility[utilityKey];
    const settings = scaleSettings[utilityKey];
    const shouldScale = settings.scale && oldValue > 0;
    const scoring = shouldScale
      ? this.scaleSkaterScoring(projection.stats.scoring, value / oldValue, settings.scalableStats)
      : projection.stats.scoring;
    return {
      ...projection,
      stats: {
        ...projection.stats,
        scoring,
        utility: { ...projection.stats.utility, [utilityKey]: value },
      },
    };
  }

  private applyGoalieStatValue(
    projection: GoalieProjection,
    key: GoalieStatKey,
    value: number,
    scaleSettings: Record<SkaterUtilityStatKey, ScaleConfig>,
  ): GoalieProjection {
    const isScoring = (GOALIE_SCORING_STAT_KEYS as readonly string[]).includes(key);
    if (isScoring) {
      return {
        ...projection,
        stats: { ...projection.stats, scoring: { ...projection.stats.scoring, [key]: value } },
      };
    }
    const utilityKey = key as SkaterUtilityStatKey;
    const oldValue = projection.stats.utility[utilityKey as 'gp'];
    const settings = scaleSettings[utilityKey];
    const shouldScale = settings.scale && oldValue > 0;
    const scoring = shouldScale
      ? this.scaleGoalieScoring(projection.stats.scoring, value / oldValue, settings.scalableStats)
      : projection.stats.scoring;
    return {
      ...projection,
      stats: {
        ...projection.stats,
        scoring,
        utility: { ...projection.stats.utility, [utilityKey]: value },
      },
    };
  }

  private isSkaterProjection(projection: Projection): projection is SkaterProjection {
    return projection.type === 'skater';
  }

  private scaleSkaterScoring(
    scoring: SkaterScoringStats,
    ratio: number,
    scalable: Set<ScoringStatKey>,
  ): SkaterScoringStats {
    const scaled = { ...scoring };
    SKATER_SCORING_STAT_KEYS.forEach((key) => {
      if (scalable.has(key)) {
        scaled[key] = scoring[key] * ratio;
      }
    });
    return scaled;
  }

  private scaleGoalieScoring(
    scoring: GoalieScoringStats,
    ratio: number,
    scalable: Set<ScoringStatKey>,
  ): GoalieScoringStats {
    const scaled = { ...scoring };
    GOALIE_SCORING_STAT_KEYS.forEach((key) => {
      if (scalable.has(key)) {
        scaled[key] = scoring[key] * ratio;
      }
    });
    return scaled;
  }
}
