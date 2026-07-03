import { describe, it, expect } from 'vitest';
import { DEMO_PLAYERS } from './demo-players';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../models/stat-key.model';

describe('DEMO_PLAYERS', () => {
  it('has a healthy pool of skaters and goalies to rank', () => {
    const skaters = DEMO_PLAYERS.filter((player) => player.type === 'skater');
    const goalies = DEMO_PLAYERS.filter((player) => player.type === 'goalie');

    expect(skaters.length).toBeGreaterThanOrEqual(20);
    expect(goalies.length).toBeGreaterThanOrEqual(4);
  });

  it('gives every player a unique id', () => {
    const ids = DEMO_PLAYERS.map((player) => player.id);
    expect(new Set(ids).size).toEqual(ids.length);
  });

  it('gives every skater a complete, coherent stat line', () => {
    for (const player of DEMO_PLAYERS) {
      if (player.type !== 'skater') {
        continue;
      }
      expect(player.positions.size).toBeGreaterThan(0);
      expect(player.stats.utility.gp).toBeGreaterThan(0);
      expect(player.stats.utility.toiPerGame).toBeGreaterThan(0);
      for (const key of SKATER_SCORING_STAT_KEYS) {
        expect(typeof player.stats.scoring[key]).toEqual('number');
      }
      expect(player.stats.scoring.points).toEqual(
        player.stats.scoring.goals + player.stats.scoring.assists,
      );
    }
  });

  it('gives every goalie a complete stat line', () => {
    for (const player of DEMO_PLAYERS) {
      if (player.type !== 'goalie') {
        continue;
      }
      expect(player.stats.utility.gp).toBeGreaterThan(0);
      for (const key of GOALIE_SCORING_STAT_KEYS) {
        expect(typeof player.stats.scoring[key]).toEqual('number');
      }
    }
  });
});
