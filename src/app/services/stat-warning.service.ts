import { Injectable } from '@angular/core';
import { Projection } from '../models/projection.model';
import { StatKey } from '../models/stat-key.model';

const SEASON_GAMES = 82;
const MAX_TOI_SECONDS = 60 * 60;
const MAX_PERCENTAGE = 100;
const POINTS_TOLERANCE = 0.01;

@Injectable({
  providedIn: 'root',
})
export class StatWarningService {
  warningsFor(projection: Projection): Map<StatKey, string> {
    const warnings = new Map<StatKey, string>();

    if (projection.stats.utility.gp > SEASON_GAMES) {
      warnings.set('gp', `Projected over the ${SEASON_GAMES}-game season`);
    }

    if (projection.type === 'skater') {
      const { scoring, utility } = projection.stats;
      if (utility.toiPerGame > MAX_TOI_SECONDS) {
        warnings.set('toiPerGame', 'Over 60 minutes per game');
      }
      if (scoring.ppg > scoring.goals) {
        warnings.set('ppg', 'More than total goals');
      }
      if (scoring.shg > scoring.goals) {
        warnings.set('shg', 'More than total goals');
      }
      if (scoring.gwg > scoring.goals) {
        warnings.set('gwg', 'More than total goals');
      }
      if (scoring.ppa > scoring.assists) {
        warnings.set('ppa', 'More than total assists');
      }
      if (scoring.sha > scoring.assists) {
        warnings.set('sha', 'More than total assists');
      }
      if (scoring.goals > scoring.sog) {
        warnings.set('goals', 'More goals than shots on goal');
      }
      if (Math.abs(scoring.goals + scoring.assists - scoring.points) > POINTS_TOLERANCE) {
        warnings.set('points', "Doesn't equal Goals + Assists");
      }
      if (Math.abs(scoring.ppg + scoring.ppa - scoring.ppp) > POINTS_TOLERANCE) {
        warnings.set('ppp', "Doesn't equal PPG + PPA");
      }
      if (Math.abs(scoring.shg + scoring.sha - scoring.shp) > POINTS_TOLERANCE) {
        warnings.set('shp', "Doesn't equal SHG + SHA");
      }
      if (scoring.shPct > MAX_PERCENTAGE) {
        warnings.set('shPct', 'Over 100%');
      }
    } else {
      const { scoring, utility } = projection.stats;
      if (scoring.gs > utility.gp) {
        warnings.set('gs', 'More than games played');
      }
      if (scoring.w + scoring.l > utility.gp) {
        warnings.set('w', 'Wins + losses exceed games played');
        warnings.set('l', 'Wins + losses exceed games played');
      }
      if (scoring.sv > scoring.sa) {
        warnings.set('sv', 'More than shots against');
      }
      if (scoring.ga > scoring.sa) {
        warnings.set('ga', 'More than shots against');
      }
      if (Math.abs(scoring.sv + scoring.ga - scoring.sa) > POINTS_TOLERANCE) {
        warnings.set('sa', "Doesn't equal Saves + Goals against");
      }
      if (scoring.svPct > MAX_PERCENTAGE) {
        warnings.set('svPct', 'Over 100%');
      }
    }

    return warnings;
  }
}
