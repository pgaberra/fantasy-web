import { Pipe, PipeTransform } from '@angular/core';
import { UtilityStatKey } from '../models/stat-key.model';

const STAT_DESCRIPTIONS: Record<UtilityStatKey, string> = {
  gp: 'Show a GP column so you can project how many games each player will appear in.',
  toiPerGame:
    'Show a TOI/G column so you can project how much ice time each player will receive per game.',
};

@Pipe({
  name: 'statDesc',
  standalone: true,
})
export class StatDescPipe implements PipeTransform {
  transform(key: UtilityStatKey): string {
    return STAT_DESCRIPTIONS[key];
  }
}
