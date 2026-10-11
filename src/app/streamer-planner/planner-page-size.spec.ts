import { beforeEach, describe, expect, it } from 'vitest';
import { readPageSize, writePageSize } from './planner-page-size';

describe('planner page size', () => {
  beforeEach(() => localStorage.clear());

  it('opens on ten a page on a phone and twenty-five on a desktop', () => {
    expect(readPageSize('phone')).toBe(10);
    expect(readPageSize('desktop')).toBe(25);
  });

  it('keeps each layout its own choice', () => {
    writePageSize('desktop', 50);
    expect(readPageSize('desktop')).toBe(50);
    expect(readPageSize('phone')).toBe(10);

    writePageSize('phone', 25);
    expect(readPageSize('phone')).toBe(25);
    expect(readPageSize('desktop')).toBe(50);
  });

  it('falls back to the default on a size not on offer or a store it cannot read', () => {
    localStorage.setItem('slapstat.streamerPlanner.pageSize', JSON.stringify({ desktop: 7 }));
    expect(readPageSize('desktop')).toBe(25);

    localStorage.setItem('slapstat.streamerPlanner.pageSize', '{not json');
    expect(readPageSize('desktop')).toBe(25);

    localStorage.setItem('slapstat.streamerPlanner.pageSize', '[50]');
    expect(readPageSize('desktop')).toBe(25);
  });
});
