import { Pipe, PipeTransform } from '@angular/core';
import { StatKey } from '../models/stat-key.model';

const STAT_LABELS: Record<StatKey, string> = {
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
  gwg: 'GWG',
  sog: 'SOG',
  shPct: 'SH%',
  fw: 'FW',
  fl: 'FL',
  hits: 'Hits',
  blocks: 'Blocks',
  gp: 'GP',
  toiPerGame: 'TOI/G',
  gs: 'Games Started',
  w: 'Wins',
  l: 'Losses',
  sho: 'Shutouts',
  sa: 'SA',
  sv: 'SV',
  ga: 'GA',
  gaa: 'GAA',
  svPct: 'SV%',
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
