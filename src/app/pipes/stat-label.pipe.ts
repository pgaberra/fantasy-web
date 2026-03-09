import { Pipe, PipeTransform } from '@angular/core';
import { StatKey } from '../models/player.model';

const STAT_LABELS: Record<StatKey, string> = {
  goals: 'Goals',
  assists: 'Assists',
  plusMinus: '+/-',
  pim: 'PIM',
  ppg: 'PPG',
  ppa: 'PPA',
  shg: 'SHG',
  sha: 'SHA',
  gwg: 'GWG',
  sog: 'SOG',
  shPct: 'SH%',
  fw: 'FW',
  fl: 'FL',
  hits: 'Hits',
  blocks: 'Blocks',
  gp: 'GP',
  toiPerGame: 'TOI/G'
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
