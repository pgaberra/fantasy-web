import { Injectable } from '@angular/core';
import { ScoringStatKey } from '../models/player.model';

@Injectable({
  providedIn: 'root',
})
export class ProjectionCalculationService {
  computeTotalPoints(
    stats: Record<ScoringStatKey, number>,
    statWeights: Record<ScoringStatKey, number>,
    activeScoringColumns: Set<ScoringStatKey>,
  ): number {
    return Object.entries(statWeights)
      .filter(([key, _]) => activeScoringColumns.has(key as ScoringStatKey))
      .reduce((sum, [key, weight]) => sum + stats[key as ScoringStatKey] * weight, 0);
  }

  // TODO this has to be rewritten
  computeZScores(fantasyPoints: number[]): number[] {
    const n = fantasyPoints.length;
    if (n === 0) return [];

    const mean = fantasyPoints.reduce((sum, v) => sum + v, 0) / n;
    const stdDev = Math.sqrt(fantasyPoints.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n);

    if (stdDev === 0) return fantasyPoints.map(() => 0);

    return fantasyPoints.map((v) => (v - mean) / stdDev);
  }
}
