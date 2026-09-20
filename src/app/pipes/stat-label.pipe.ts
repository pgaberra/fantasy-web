import { Pipe, PipeTransform } from '@angular/core';
import { StatKey } from '../models/stat-key.model';

export const STAT_LABELS: Record<StatKey, string> = {
  goals: 'Goals',
  assists: 'Assists',
  points: 'P',
  plusMinus: '+/-',
  pim: 'PIM',
  ppg: 'PPG',
  ppa: 'PPA',
  ppp: 'PPP',
  shg: 'SHG',
  sha: 'SHA',
  shp: 'SHP',
  stpg: 'STPG',
  stpa: 'STPA',
  stp: 'STP',
  gwg: 'GWG',
  hatTricks: 'HAT',
  sog: 'SOG',
  shPct: 'SH%',
  fw: 'FW',
  fl: 'FL',
  hits: 'Hits',
  blocks: 'Blocks',
  defPoints: 'DEF',
  shifts: 'Shifts',
  toi: 'TOI',
  gp: 'GP',
  toiPerGame: 'TOI/G',
  gs: 'GS',
  w: 'Wins',
  l: 'Losses',
  otl: 'OTL',
  sho: 'Shutouts',
  sa: 'SA',
  sv: 'SV',
  ga: 'GA',
  gaa: 'GAA',
  svPct: 'SV%',
  winPct: 'W%',
};

@Pipe({
  name: 'statLabel',
  standalone: true,
})
export class StatLabelPipe implements PipeTransform {
  transform(key: StatKey): string {
    return STAT_LABELS[key];
  }
}
