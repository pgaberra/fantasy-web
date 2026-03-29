import { Injectable } from '@angular/core';
import {
  GoalieScoringStatKey,
  ScoringStatKey,
  SkaterScoringStatKey,
} from '../models/stat-key.model';
import { GoalieScoringStats, SkaterScoringStats, StatWeights } from '../models/projection.model';

@Injectable({
  providedIn: 'root',
})
export class ProjectionCalculationService {
  computeSkaterTotalPoints(
    stats: SkaterScoringStats,
    statWeights: StatWeights,
    activeScoringColumns: Set<ScoringStatKey>,
  ): number {
    return Object.entries(statWeights)
      .filter(([key]) => activeScoringColumns.has(key as ScoringStatKey))
      .reduce((sum, [key, weight]) => sum + (stats[key as SkaterScoringStatKey] ?? 0) * weight, 0);
  }

  computeGoalieTotalPoints(
    stats: GoalieScoringStats,
    statWeights: StatWeights,
    activeScoringColumns: Set<ScoringStatKey>,
  ): number {
    return Object.entries(statWeights)
      .filter(([key]) => activeScoringColumns.has(key as ScoringStatKey))
      .reduce((sum, [key, weight]) => sum + (stats[key as GoalieScoringStatKey] ?? 0) * weight, 0);
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
