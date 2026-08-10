import { Pipe, PipeTransform } from '@angular/core';
import { StatKey } from '../models/stat-key.model';
import { STAT_LABELS } from './stat-label.pipe';

export const STAT_FULL_NAMES: Record<StatKey, string> = {
  goals: 'Goals',
  assists: 'Assists',
  points: 'Points',
  plusMinus: 'Plus/Minus',
  pim: 'Penalty Minutes',
  ppg: 'Power Play Goals',
  ppa: 'Power Play Assists',
  ppp: 'Power Play Points',
  shg: 'Shorthanded Goals',
  sha: 'Shorthanded Assists',
  shp: 'Shorthanded Points',
  stpg: 'Special Teams Goals',
  stpa: 'Special Teams Assists',
  stp: 'Special Teams Points',
  gwg: 'Game-Winning Goals',
  hatTricks: 'Hat Tricks',
  sog: 'Shots on Goal',
  shPct: 'Shooting Percentage',
  fw: 'Faceoffs Won',
  fl: 'Faceoffs Lost',
  hits: 'Hits',
  blocks: 'Blocked Shots',
  defPoints: 'Defensemen Points',
  shifts: 'Shifts',
  toi: 'Time on Ice',
  gp: 'Games Played',
  toiPerGame: 'Time on Ice per Game',
  gs: 'Games Started',
  w: 'Wins',
  l: 'Losses',
  otl: 'Overtime Losses',
  sho: 'Shutouts',
  sa: 'Shots Against',
  sv: 'Saves',
  ga: 'Goals Against',
  gaa: 'Goals Against Average',
  svPct: 'Save Percentage',
  winPct: 'Win Percentage',
};

@Pipe({
  name: 'statTooltip',
  standalone: true,
})
export class StatTooltipPipe implements PipeTransform {
  transform(key: StatKey): string | null {
    const fullName = STAT_FULL_NAMES[key];
    return fullName === STAT_LABELS[key] ? null : fullName;
  }
}
