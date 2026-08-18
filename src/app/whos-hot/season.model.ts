/**
 * A season the leaderboard can be measured over, identified by the year it starts in — the same
 * number the splits API takes.
 */
export interface Season {
  startYear: number;
  label: string;
}

/**
 * Newest last, so the dropdown reads forwards. A season is listed as soon as it exists on the
 * calendar rather than once it has games: picking one that hasn't started is how a user finds
 * out it hasn't, and the leaderboard says so in as many words.
 */
export const SEASONS: readonly Season[] = [
  { startYear: 2025, label: '2025-26' },
  { startYear: 2026, label: '2026-27' },
];

export const DEFAULT_SEASON_START_YEAR = 2025;

/** Every NHL season is the same length, so the range is expressed against one number. */
export const SEASON_SCHEDULE_GAMES = 82;

export function seasonLabelOf(startYear: number): string {
  return (
    SEASONS.find((season) => season.startYear === startYear)?.label ??
    `${startYear}-${startYear + 1}`
  );
}
