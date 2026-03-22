import { Injectable } from '@angular/core';
import { SCORING_STAT_KEYS, ScoringStatKey, StatKey, UtilityStatKey } from '../models/player.model';
import { PlayerProjection } from '../draft-projection/model';
import { ScaleConfig } from '../draft-projection/projection-settings-section/model';

@Injectable({
  providedIn: 'root',
})
export class ProjectionUpdateService {
  scaleScoring(
    scoring: Record<ScoringStatKey, number>,
    ratio: number,
    scalable: Set<ScoringStatKey>,
  ): Record<ScoringStatKey, number> {
    const scaled = { ...scoring };
    SCORING_STAT_KEYS.forEach((key) => {
      if (scalable.has(key)) {
        scaled[key] = scoring[key] * ratio;
      }
    });
    return scaled;
  }

  applyToiDelta(
    playerProjections: PlayerProjection[],
    playerId: number,
    delta: number,
    scaleSettings: Record<UtilityStatKey, ScaleConfig>,
  ): PlayerProjection[] {
    return playerProjections.map((pp) => {
      if (pp.playerId !== playerId) return pp;
      const oldToi = pp.stats.utility.toiPerGame;
      const newToi = Math.max(0, oldToi + delta);
      const toiSettings = scaleSettings.toiPerGame;
      const shouldScale = toiSettings.scale && oldToi > 0;
      const scoring = shouldScale
        ? this.scaleScoring(pp.stats.scoring, newToi / oldToi, toiSettings.scalableStats)
        : pp.stats.scoring;
      return {
        ...pp,
        stats: { ...pp.stats, scoring, utility: { ...pp.stats.utility, toiPerGame: newToi } },
      };
    });
  }

  applyStatValue(
    playerProjections: PlayerProjection[],
    playerId: number,
    key: StatKey,
    value: number,
    scaleSettings: Record<UtilityStatKey, ScaleConfig>,
  ): PlayerProjection[] {
    return playerProjections.map((pp) => {
      if (pp.playerId !== playerId) return pp;
      const isScoring = (SCORING_STAT_KEYS as readonly string[]).includes(key);
      if (isScoring) {
        return { ...pp, stats: { ...pp.stats, scoring: { ...pp.stats.scoring, [key]: value } } };
      }
      const utilityKey = key as UtilityStatKey;
      const oldValue = pp.stats.utility[utilityKey];
      const settings = scaleSettings[utilityKey];
      const shouldScale = settings ? settings.scale && oldValue > 0 : false;
      const scalable = settings ? settings.scalableStats : new Set<ScoringStatKey>();
      const scoring = shouldScale
        ? this.scaleScoring(pp.stats.scoring, value / oldValue, scalable)
        : pp.stats.scoring;
      return {
        ...pp,
        stats: { ...pp.stats, scoring, utility: { ...pp.stats.utility, [key]: value } },
      };
    });
  }
}
