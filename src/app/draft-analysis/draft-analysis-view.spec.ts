import { describe, expect, it } from 'vitest';
import { DraftAnalysisPick } from '../api/models/draft-analysis-pick';
import { filterPicks, gradeTone, pickLabel, signedValue } from './draft-analysis-view';

const pick = (
  overall: number,
  teamId: string,
  grade?: DraftAnalysisPick['grade'],
): DraftAnalysisPick => ({
  overall,
  round: 1,
  teamId,
  playerId: overall,
  positions: ['C'],
  grade,
});

describe('pickLabel', () => {
  it('names a pick by its round and its place in the round', () => {
    expect(pickLabel({ overall: 87, round: 8 }, 12)).toBe('8.03');
    expect(pickLabel({ overall: 1, round: 1 }, 12)).toBe('1.01');
    expect(pickLabel({ overall: 24, round: 2 }, 12)).toBe('2.12');
  });

  it('falls back to the overall number without teams to count by', () => {
    expect(pickLabel({ overall: 87, round: 8 }, 0)).toBe('#87');
  });
});

describe('signedValue', () => {
  it('signs a gain and a loss alike, to one decimal', () => {
    expect(signedValue(12.34)).toBe('+12.3');
    expect(signedValue(-4)).toBe('-4.0');
    expect(signedValue(0.04)).toBe('0.0');
  });

  it('writes nothing for a value that is not there', () => {
    expect(signedValue(undefined)).toBe('');
    expect(signedValue(null)).toBe('');
  });
});

describe('filterPicks', () => {
  const picks = [
    pick(1, 't1', 'STEAL'),
    pick(2, 't2', 'BIG_REACH'),
    pick(3, 't2', 'GOOD'),
    pick(4, 't1', 'REACH'),
    pick(5, 't1', 'FAIR'),
    pick(6, 't2'),
  ];

  it('keeps every pick with no filter', () => {
    expect(filterPicks(picks, null, 'all')).toHaveLength(6);
  });

  it("keeps one team's picks in draft order", () => {
    expect(filterPicks(picks, 't1', 'all').map((p) => p.overall)).toEqual([1, 4, 5]);
  });

  it('keeps the good picks or the reaches, ungraded ones in neither', () => {
    expect(filterPicks(picks, null, 'good').map((p) => p.overall)).toEqual([1, 3]);
    expect(filterPicks(picks, 't2', 'bad').map((p) => p.overall)).toEqual([2]);
  });
});

describe('gradeTone', () => {
  it('colours the good grades and the reaches, and nothing else', () => {
    expect(gradeTone('STEAL')).toBe('good');
    expect(gradeTone('GOOD')).toBe('good');
    expect(gradeTone('FAIR')).toBe('neutral');
    expect(gradeTone('REACH')).toBe('bad');
    expect(gradeTone('BIG_REACH')).toBe('bad');
    expect(gradeTone('UNRANKED')).toBe('neutral');
    expect(gradeTone(undefined)).toBe('neutral');
  });
});
