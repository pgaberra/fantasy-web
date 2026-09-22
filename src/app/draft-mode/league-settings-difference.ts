import { DraftSettings } from '../api/models/draft-settings';
import { LeagueProjectionSettingsResponse } from '../api/models/league-projection-settings-response';
import { RosterSlots } from '../api/models/roster-slots';

/**
 * Linking a league from inside a running draft only needs the league's identity: its picks are
 * what the board follows. Its settings are a separate question, and one worth asking, because
 * importing them re-ranks a board the user is already drafting off. Asked only where there is
 * something to ask about — these are the differences, in the words the settings are shown by.
 *
 * A setting the draft has no value for cannot disagree with the league's, so it is not a
 * difference: importing simply fills it in.
 */
export function leagueSettingsDifferences(
  current: DraftSettings | null,
  league: LeagueProjectionSettingsResponse,
): string[] {
  if (!current) {
    return [];
  }
  const differences: string[] = [];
  if (current.scoringType !== league.scoringType) {
    differences.push('Scoring type');
  }
  if (!sameList(current.activeScoringColumns, league.activeScoringColumns)) {
    differences.push('Scoring categories');
  }
  if (!sameList(current.activeUtilityColumns, league.activeUtilityColumns)) {
    differences.push('Extra columns');
  }
  if (league.statWeights && !sameWeights(current.statWeights, league.statWeights)) {
    differences.push('Points per stat');
  }
  if (!sameSlots(current.rosterSlots, league.rosterSlots)) {
    differences.push('Roster slots');
  }
  if (
    league.leagueSize != null &&
    current.leagueSize != null &&
    current.leagueSize !== league.leagueSize
  ) {
    differences.push('Number of teams');
  }
  return differences;
}

/** Order is what the columns are shown in, so a reordering is a difference like any other. */
function sameList(mine: readonly string[], theirs: readonly string[]): boolean {
  return mine.length === theirs.length && mine.every((value, index) => value === theirs[index]);
}

function sameWeights(mine: Record<string, number>, theirs: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  return [...keys].every((key) => mine[key] === theirs[key]);
}

function sameSlots(mine: RosterSlots, theirs: RosterSlots): boolean {
  return (Object.keys(mine) as (keyof RosterSlots)[]).every((slot) => mine[slot] === theirs[slot]);
}
