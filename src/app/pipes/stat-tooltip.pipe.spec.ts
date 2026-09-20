import { describe, it, expect } from 'vitest';
import { StatTooltipPipe } from './stat-tooltip.pipe';

describe('StatTooltipPipe', () => {
  const pipe = new StatTooltipPipe();

  it('expands an abbreviation to its full stat name', () => {
    expect(pipe.transform('gp')).toEqual('Games Played');
    expect(pipe.transform('gs')).toEqual('Games Started');
    expect(pipe.transform('ppp')).toEqual('Power Play Points');
    expect(pipe.transform('sv')).toEqual('Saves');
    expect(pipe.transform('ga')).toEqual('Goals Against');
    expect(pipe.transform('toiPerGame')).toEqual('Time on Ice per Game');
  });

  it('returns null when the label already spells the stat out', () => {
    expect(pipe.transform('goals')).toEqual(null);
    expect(pipe.transform('assists')).toEqual(null);
    expect(pipe.transform('hits')).toEqual(null);
    expect(pipe.transform('w')).toEqual(null);
  });
});
