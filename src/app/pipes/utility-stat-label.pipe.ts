import { Pipe, PipeTransform } from '@angular/core';
import { UtilityStatKey } from '../models/player.model';

const UTILITY_STAT_LABELS: Record<UtilityStatKey, string> = {
  gp: 'Games Played (GP)',
  toiPerGame: 'Time on Ice per Game (TOI/G)'
};

@Pipe({
  name: 'utilityStatLabel',
  standalone: true,
})
export class UtilityStatLabelPipe implements PipeTransform {
  transform(key: UtilityStatKey): string {
    return UTILITY_STAT_LABELS[key];
  }
}
