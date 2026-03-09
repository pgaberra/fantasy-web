import { ScoringStatKey, StatKey } from '../../models/player.model';

export interface StatUpdateEvent {
  playerId: number;
  key: StatKey;
  value: number;
}

export interface WeightUpdateEvent {
  key: ScoringStatKey;
  value: number;
}
