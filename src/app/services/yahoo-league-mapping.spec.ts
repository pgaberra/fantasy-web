import { describe, expect, it } from 'vitest';
import { mapLeagueSettings } from './yahoo-league-mapping';
import { LeagueSettingsResponse } from '../api/models/league-settings-response';
import { StatCategory } from '../api/models/stat-category';
import { RosterSlot } from '../api/models/roster-slot';

function cat(statId: number, name: string, pointValue?: number): StatCategory {
  return { statId, name, displayName: name, pointValue };
}

function slot(position: string, count: number): RosterSlot {
  return { position, count };
}

function league(overrides: Partial<LeagueSettingsResponse>): LeagueSettingsResponse {
  return {
    leagueKey: '453.l.1',
    name: 'Test League',
    scoringType: 'category',
    statCategories: [],
    rosterPositions: [],
    ...overrides,
  };
}

describe('mapLeagueSettings', () => {
  it('maps a points league, deriving weights from point values and zeroing the rest', () => {
    const result = mapLeagueSettings(
      league({
        scoringType: 'points',
        statCategories: [cat(1, 'Goals', 3), cat(2, 'Assists', 2), cat(25, 'Saves', 0.2)],
        rosterPositions: [slot('C', 2), slot('G', 2), slot('BN', 4)],
      }),
      12,
    );

    expect(result.headToHead).toEqual(false);
    const mapped = result.mapped;
    expect(mapped).not.toBeNull();
    expect(mapped!.scoringType).toEqual('points');
    expect(mapped!.activeScoringColumns).toEqual(['goals', 'assists', 'sv']);
    expect(mapped!.statWeights!['goals']).toEqual(3);
    expect(mapped!.statWeights!['assists']).toEqual(2);
    expect(mapped!.statWeights!['sv']).toEqual(0.2);
    expect(mapped!.statWeights!['hits']).toEqual(0);
    expect(mapped!.leagueSize).toEqual(12);
    expect(mapped!.rosterSlots).toEqual({ c: 2, lw: 0, rw: 0, d: 0, util: 0, bn: 4, g: 2 });
  });

  it('maps a category league with null weights', () => {
    const result = mapLeagueSettings(
      league({
        scoringType: 'category',
        statCategories: [cat(1, 'Goals'), cat(2, 'Assists'), cat(19, 'Wins'), cat(26, 'Save %')],
      }),
      10,
    );

    expect(result.mapped!.scoringType).toEqual('category');
    expect(result.mapped!.statWeights).toBeNull();
    expect(result.mapped!.activeScoringColumns).toEqual(['goals', 'assists', 'w', 'svPct']);
    expect(result.mapped!.leagueSize).toEqual(10);
  });

  it('does not sync head-to-head leagues yet', () => {
    const result = mapLeagueSettings(league({ scoringType: 'head' }));
    expect(result.mapped).toBeNull();
    expect(result.headToHead).toEqual(true);
  });

  it('returns no mapping for an unknown scoring type without flagging head-to-head', () => {
    const result = mapLeagueSettings(league({ scoringType: 'something-else' }));
    expect(result.mapped).toBeNull();
    expect(result.headToHead).toEqual(false);
  });

  it('flags stats with no projection equivalent as unsupported', () => {
    const result = mapLeagueSettings(
      league({
        scoringType: 'category',
        statCategories: [cat(1, 'Goals'), cat(13, 'Game-Tying Goals')],
      }),
    );
    expect(result.mapped!.activeScoringColumns).toEqual(['goals']);
    expect(result.unsupportedStats).toEqual(['Game-Tying Goals']);
  });

  it('routes GP/TOI categories to utility columns and always keeps gp', () => {
    const withToi = mapLeagueSettings(
      league({
        scoringType: 'category',
        statCategories: [cat(34, 'Time on Ice/G'), cat(1, 'Goals')],
      }),
    );
    expect(withToi.mapped!.activeUtilityColumns).toEqual(['gp', 'toiPerGame']);

    const noUtil = mapLeagueSettings(
      league({ scoringType: 'category', statCategories: [cat(1, 'Goals')] }),
    );
    expect(noUtil.mapped!.activeUtilityColumns).toEqual(['gp']);
  });

  it('maps roster slots, ignores IR, and approximates W to util', () => {
    const result = mapLeagueSettings(
      league({
        scoringType: 'category',
        rosterPositions: [
          slot('C', 2),
          slot('LW', 2),
          slot('RW', 2),
          slot('D', 4),
          slot('Util', 1),
          slot('G', 2),
          slot('BN', 4),
          slot('IR', 2),
          slot('W', 1),
        ],
      }),
    );
    expect(result.mapped!.rosterSlots).toEqual({ c: 2, lw: 2, rw: 2, d: 4, util: 2, bn: 4, g: 2 });
    expect(result.unsupportedRosterCodes).toContain('IR');
    expect(result.unsupportedRosterCodes).toContain('W');
  });

  it('clamps league size and leaves it null when unknown', () => {
    expect(mapLeagueSettings(league({}), undefined).mapped!.leagueSize).toBeNull();
    expect(mapLeagueSettings(league({}), 40).mapped!.leagueSize).toEqual(30);
    expect(mapLeagueSettings(league({}), 1).mapped!.leagueSize).toEqual(2);
    expect(mapLeagueSettings(league({}), 14).mapped!.leagueSize).toEqual(14);
  });
});
