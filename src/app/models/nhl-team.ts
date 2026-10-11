/**
 * Clubs whose abbreviation differs between sources, folded to the NHL's own spelling. Yahoo and
 * ESPN agree with the NHL on twenty-eight of the thirty-two clubs; spreadsheets add a few more
 * spellings of their own.
 */
const TEAM_ALIASES: Record<string, string> = {
  LA: 'LAK',
  TB: 'TBL',
  NJ: 'NJD',
  SJ: 'SJS',
  MON: 'MTL',
  CLB: 'CBJ',
  NAS: 'NSH',
  WAS: 'WSH',
  CAL: 'CGY',
  WIN: 'WPG',
  UTAH: 'UTA',
  UHC: 'UTA',
};

/**
 * A club abbreviation in any source's spelling, as the NHL spells it and upper-cased, so a
 * platform's `TB` finds the schedule the NHL publishes under `TBL`. Null for nothing at all.
 */
export function nhlTeamKey(team: string | null | undefined): string | null {
  if (team === null || team === undefined) {
    return null;
  }
  const upper = team.trim().toUpperCase();
  if (!upper) {
    return null;
  }
  return TEAM_ALIASES[upper] ?? upper;
}
