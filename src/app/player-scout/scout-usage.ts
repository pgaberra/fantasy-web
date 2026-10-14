import { LineupListing } from '../api/models/lineup-listing';
import { RoleWindow } from '../api/models/role-window';
import { ScoutUsage } from '../api/models/scout-usage';

/**
 * The smallest change worth colouring. Below these a skater's ice swings with one blowout or one
 * penalty-filled night, and every row would wear a mark.
 */
export const MIN_ICE_CHANGE_SECONDS = 60;
export const MIN_POWER_PLAY_SHARE_CHANGE = 0.1;

/** A listing before and now, for the table to draw with an arrow between. */
export interface ListingMove {
  readonly from: string;
  readonly to: string;
}

/**
 * What the ice says about a skater since the chosen day, read as changes: his games since it
 * beside his games before, and where the lineup page lists him now against then.
 */
export interface UsageChange {
  readonly recent: RoleWindow;
  readonly baseline: RoleWindow | null;
  readonly baselineSource: 'SEASON' | 'LAST_SEASON' | null;
  /** Seconds a game, since less before. Null without a baseline. */
  readonly iceChange: number | null;
  /** Power-play seconds a game, since less before. Null where either side has no reading. */
  readonly powerPlayIceChange: number | null;
  /** Share of the club's power play, since less before, -1 to 1. */
  readonly powerPlayShareChange: number | null;
  readonly listedNow: LineupListing | null;
  readonly listedBefore: LineupListing | null;
  /** The lineup page's even-strength listing then and now, when it moved: L4 to L2. */
  readonly lineMove: ListingMove | null;
  /** The lineup page's power-play listing then and now, when it moved: PP2 to PP1. */
  readonly powerPlayMove: ListingMove | null;
  /** Whether the lineup page moved him up (true), down (false), or neither (null). */
  readonly listedHigher: boolean | null;
}

function difference(
  recent: number | null | undefined,
  baseline: number | null | undefined,
): number | null {
  return recent == null || baseline == null ? null : recent - baseline;
}

/** "L2" for the second forward line, "D1" for the top pair; null for no listing. */
export function lineLabel(listing: LineupListing | undefined | null): string | null {
  const line = listing?.line;
  if (!line) {
    return null;
  }
  return `${line.startsWith('d') ? 'D' : 'L'}${line.slice(1)}`;
}

/** "PP1", "PP2", or "No PP". */
export function powerPlayLabel(listing: LineupListing | undefined | null): string {
  return listing?.powerPlayUnit ? `PP${listing.powerPlayUnit}` : 'No PP';
}

/** Lower is higher in the lineup: line 1 above line 4, PP1 above PP2 above no power play. */
function lineRank(listing: LineupListing): number | null {
  return listing.line ? Number(listing.line.slice(1)) : null;
}

function powerPlayRank(listing: LineupListing): number {
  return listing.powerPlayUnit ?? 3;
}

/** The changes read off a skater's usage; null where he has none. */
export function usageChange(usage: ScoutUsage | null | undefined): UsageChange | null {
  if (!usage) {
    return null;
  }
  const { recent, baseline, listedBefore, listedNow } = usage;
  let lineMove: ListingMove | null = null;
  let powerPlayMove: ListingMove | null = null;
  let listedHigher: boolean | null = null;
  if (listedBefore && listedNow) {
    const before = lineRank(listedBefore);
    const now = lineRank(listedNow);
    if (before != null && now != null && before !== now) {
      lineMove = { from: lineLabel(listedBefore)!, to: lineLabel(listedNow)! };
      listedHigher = now < before;
    }
    const ppBefore = powerPlayRank(listedBefore);
    const ppNow = powerPlayRank(listedNow);
    if (ppBefore !== ppNow) {
      powerPlayMove = { from: powerPlayLabel(listedBefore), to: powerPlayLabel(listedNow) };
      listedHigher = listedHigher ?? ppNow < ppBefore;
    }
  }
  return {
    recent,
    baseline: baseline ?? null,
    baselineSource: usage.baselineSource ?? null,
    iceChange: difference(recent.toiPerGame, baseline?.toiPerGame),
    powerPlayIceChange: difference(recent.ppToiPerGame, baseline?.ppToiPerGame),
    powerPlayShareChange: difference(recent.ppShare, baseline?.ppShare),
    listedNow: listedNow ?? null,
    listedBefore: listedBefore ?? null,
    lineMove,
    powerPlayMove,
    listedHigher,
  };
}

/** Seconds as m:ss, the way ice time is printed on a game sheet. */
export function formatIce(seconds: number | null | undefined): string {
  if (seconds == null) {
    return '–';
  }
  const whole = Math.round(Math.abs(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return `${seconds < 0 ? '-' : ''}${minutes}:${rest}`;
}

/** A change in ice, signed: "+6:00", "-1:30"; "±0:00" for none. */
export function formatIceChange(seconds: number | null): string {
  if (seconds == null) {
    return '';
  }
  if (Math.round(seconds) === 0) {
    return '±0:00';
  }
  return seconds > 0 ? `+${formatIce(seconds)}` : formatIce(seconds);
}

export function formatShare(share: number | null | undefined): string {
  return share == null ? '–' : `${Math.round(share * 100)}%`;
}

/** A change in share, in percentage points: "+45 pts". */
export function formatShareChange(change: number | null): string {
  if (change == null) {
    return '';
  }
  const points = Math.round(change * 100);
  if (points === 0) {
    return '±0 pts';
  }
  return `${points > 0 ? '+' : ''}${points} pts`;
}
