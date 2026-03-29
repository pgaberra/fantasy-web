import { GoalieStats, SkaterStats } from './projection.model';
import { SkaterPosition } from './position.model';

interface BasePlayer {
  id: number;
  name: string;
}

export interface Skater extends BasePlayer {
  type: 'skater';
  positions: Set<SkaterPosition>;
  stats: SkaterStats;
}

export interface Goalie extends BasePlayer {
  type: 'goalie';
  stats: GoalieStats;
}

export type Player = Skater | Goalie;
