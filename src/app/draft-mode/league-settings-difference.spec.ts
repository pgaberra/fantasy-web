import { describe, expect, it } from 'vitest';
import { DraftSettings } from '../api/models/draft-settings';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import { leagueSettingsDifferences } from './league-settings-difference';

describe('leagueSettingsDifferences', () => {
  const slots = { c: 2, lw: 2, rw: 2, d: 4, util: 1, bn: 4, g: 2 };

  const draft: DraftSettings = {
    scoringType: 'points',
    statWeights: { goals: 3, assists: 2 },
    activeScoringColumns: ['goals', 'assists'],
    activeUtilityColumns: ['gp'],
    rosterSlots: slots,
    leagueSize: 12,
  };

  const league: LeagueProjectionSettingsResponse = {
    scoringType: 'points',
    statWeights: { goals: 3, assists: 2 },
    activeScoringColumns: ['goals', 'assists'],
    activeUtilityColumns: ['gp'],
    rosterSlots: slots,
    leagueSize: 12,
    unsupportedRosterCodes: [],
    unsupportedStats: [],
  };

  it('finds nothing to ask about when the league scores the draft the way it is set up', () => {
    expect(leagueSettingsDifferences(draft, league)).toEqual([]);
  });

  it('names each setting the league would change', () => {
    expect(
      leagueSettingsDifferences(draft, {
        ...league,
        scoringType: 'category',
        activeScoringColumns: ['goals'],
        activeUtilityColumns: ['gp', 'toi'],
        statWeights: { goals: 1, assists: 2 },
        rosterSlots: { ...slots, bn: 6 },
        leagueSize: 10,
      }),
    ).toEqual([
      'Scoring type',
      'Scoring categories',
      'Extra columns',
      'Points per stat',
      'Roster slots',
      'Number of teams',
    ]);
  });

  it('counts a reordering of the columns, which is the order they are shown in', () => {
    expect(
      leagueSettingsDifferences(draft, { ...league, activeScoringColumns: ['assists', 'goals'] }),
    ).toEqual(['Scoring categories']);
  });

  // Nothing to disagree with: importing only fills the setting in, which is no question to ask.
  it('passes over a setting the draft has no value for', () => {
    expect(
      leagueSettingsDifferences({ ...draft, leagueSize: undefined }, { ...league, leagueSize: 10 }),
    ).toEqual([]);
    expect(leagueSettingsDifferences(draft, { ...league, statWeights: undefined })).toEqual([]);
  });

  it('has nothing to compare against before the draft has settings of its own', () => {
    expect(leagueSettingsDifferences(null, league)).toEqual([]);
  });
});
