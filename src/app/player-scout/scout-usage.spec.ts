import { describe, expect, it } from 'vitest';
import { ScoutUsage } from '../api/models/scout-usage';
import {
  formatIce,
  formatIceChange,
  formatShare,
  formatShareChange,
  lineLabel,
  powerPlayLabel,
  usageChange,
} from './scout-usage';

function usage(
  recent: { toi: number; share?: number },
  baseline: { toi: number; share?: number } | null,
  extra: Partial<ScoutUsage> = {},
): ScoutUsage {
  return {
    recent: { games: 5, toiPerGame: recent.toi, ppShare: recent.share },
    baseline: baseline ? { games: 70, toiPerGame: baseline.toi, ppShare: baseline.share } : undefined,
    baselineSource: baseline ? 'LAST_SEASON' : undefined,
    ...extra,
  };
}

describe('usageChange', () => {
  it('reads the change in ice and in the share of the power play', () => {
    const change = usageChange(usage({ toi: 1080, share: 0.7 }, { toi: 720, share: 0.2 }));

    expect(change?.iceChange).toBe(360);
    expect(change?.powerPlayShareChange).toBeCloseTo(0.5);
    expect(change?.baselineSource).toBe('LAST_SEASON');
  });

  it('reads no change for a call-up with nothing to have moved from', () => {
    const change = usageChange(usage({ toi: 1200 }, null));

    expect(change?.baseline).toBeNull();
    expect(change?.iceChange).toBeNull();
    expect(change?.powerPlayShareChange).toBeNull();
  });

  it('is nothing for a player with no usage', () => {
    expect(usageChange(null)).toBeNull();
    expect(usageChange(undefined)).toBeNull();
  });

  it('names a move up the lineup page', () => {
    const change = usageChange(
      usage(
        { toi: 1080 },
        { toi: 720 },
        {
          listedBefore: { seenOn: '2026-09-28', line: 'f4', outOfLineup: false },
          listedNow: { seenOn: '2026-10-04', line: 'f2', powerPlayUnit: 1, outOfLineup: false },
        },
      ),
    );

    expect(change?.lineMove).toEqual({ from: 'L4', to: 'L2' });
    expect(change?.powerPlayMove).toEqual({ from: 'No PP', to: 'PP1' });
    expect(change?.listedHigher).toBe(true);
  });

  it('reads a demotion on the power play alone as a move down', () => {
    const change = usageChange(
      usage(
        { toi: 1080 },
        { toi: 1080 },
        {
          listedBefore: { seenOn: '2026-09-28', line: 'd1', powerPlayUnit: 1, outOfLineup: false },
          listedNow: { seenOn: '2026-10-04', line: 'd1', powerPlayUnit: 2, outOfLineup: false },
        },
      ),
    );

    expect(change?.lineMove).toBeNull();
    expect(change?.powerPlayMove).toEqual({ from: 'PP1', to: 'PP2' });
    expect(change?.listedHigher).toBe(false);
  });

  it('says nothing where the page did not move him', () => {
    const listing = { seenOn: '2026-10-04', line: 'd1', powerPlayUnit: 1, outOfLineup: false };
    const change = usageChange(
      usage({ toi: 1080 }, { toi: 720 }, { listedBefore: listing, listedNow: listing }),
    );

    expect(change?.lineMove).toBeNull();
    expect(change?.powerPlayMove).toBeNull();
    expect(change?.listedHigher).toBeNull();
  });
});

describe('formatting', () => {
  it('prints ice the way a game sheet does', () => {
    expect(formatIce(1085)).toBe('18:05');
    expect(formatIce(undefined)).toBe('–');
    expect(formatIceChange(360)).toBe('+6:00');
    expect(formatIceChange(-90)).toBe('-1:30');
    expect(formatIceChange(0)).toBe('±0:00');
    expect(formatIceChange(null)).toBe('');
  });

  it('prints a share and its change in percentage points', () => {
    expect(formatShare(0.456)).toBe('46%');
    expect(formatShare(null)).toBe('–');
    expect(formatShareChange(0.45)).toBe('+45 pts');
    expect(formatShareChange(-0.2)).toBe('-20 pts');
    expect(formatShareChange(0.001)).toBe('±0 pts');
  });

  it('labels a listing as the lineup page does', () => {
    expect(lineLabel({ seenOn: '2026-10-04', line: 'f3', outOfLineup: false })).toBe('L3');
    expect(lineLabel({ seenOn: '2026-10-04', line: 'd2', outOfLineup: false })).toBe('D2');
    expect(lineLabel({ seenOn: '2026-10-04', outOfLineup: true })).toBeNull();
    expect(powerPlayLabel({ seenOn: '2026-10-04', powerPlayUnit: 2, outOfLineup: false })).toBe(
      'PP2',
    );
    expect(powerPlayLabel({ seenOn: '2026-10-04', outOfLineup: false })).toBe('No PP');
  });
});
