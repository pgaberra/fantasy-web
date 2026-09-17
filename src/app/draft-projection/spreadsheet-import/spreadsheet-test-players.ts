import { Goalie, Skater } from '../../models/player.model';
import { GoalieProjection, SkaterProjection } from '../../models/projection.model';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../../models/stat-key.model';

/** A small pool for the import specs, with the spellings a sheet gets wrong. */

const zeros = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, 0]));

export function skater(id: number, name: string, teamAbbrev?: string): Skater {
  return {
    type: 'skater',
    id,
    name,
    teamAbbrev,
    positions: new Set(['C']),
    stats: {
      utility: { gp: 70, toiPerGame: 1000 },
      scoring: { ...zeros(SKATER_SCORING_STAT_KEYS), goals: 10 } as Skater['stats']['scoring'],
    },
  };
}

export function goalie(id: number, name: string, teamAbbrev?: string): Goalie {
  return {
    type: 'goalie',
    id,
    name,
    teamAbbrev,
    stats: {
      utility: { gp: 50 },
      scoring: { ...zeros(GOALIE_SCORING_STAT_KEYS), w: 25 } as Goalie['stats']['scoring'],
    },
  };
}

export function lineOf(player: Skater): SkaterProjection;
export function lineOf(player: Goalie): GoalieProjection;
export function lineOf(player: Skater | Goalie): SkaterProjection | GoalieProjection {
  return player.type === 'skater'
    ? { type: 'skater', playerId: player.id, stats: player.stats }
    : { type: 'goalie', playerId: player.id, stats: player.stats };
}

export const POOL = [
  skater(1, 'Nathan MacKinnon', 'COL'),
  skater(2, 'Tim Stützle', 'OTT'),
  skater(3, 'Mitchell Marner', 'TOR'),
  skater(4, 'Sebastian Aho', 'CAR'),
  skater(5, 'Sebastian Aho', 'NYI'),
  skater(6, 'Jack Hughes', 'NJD'),
  skater(7, 'Luke Hughes', 'NJD'),
  skater(8, 'Pierre-Luc Dubois', 'WSH'),
  goalie(9, 'Igor Shesterkin', 'NYR'),
];
