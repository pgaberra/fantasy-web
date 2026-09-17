import { StatKey } from '../../models/stat-key.model';

/**
 * Squares a line after a spreadsheet has written part of it, so the stats that are defined by
 * others agree with them again.
 *
 * An import is a merge: the sheet gives some stats and the line keeps its own for the rest. Two
 * things then break the sums the table checks (points are goals plus assists, and so on). A sheet
 * gives a total without its parts, so PPP is new and PPG and PPA are last season's. And a sheet
 * rounds each column on its own, so 44.7 goals and 84.4 assists sit beside 129.2 points. Either way
 * every row of the import would show a warning about something the user did not do.
 *
 * The rule is that what the sheet says wins over what the line already had, and parts win over
 * their total, because a total is only ever as exact as the rounding of its own column:
 *
 * - **Both parts imported:** the total is their sum, whatever the sheet's own total says.
 * - **The total and one part imported:** the other part is what is left.
 * - **Only the total imported:** the line's own parts are scaled to it, keeping their split, or, for
 *   power-play and shorthanded points the line had none of, split the way the player's points are.
 * - **Only parts imported:** the total follows them.
 *
 * Rates follow the counts they are made of (shooting and save percentage, win percentage, GAA),
 * and the season's time on ice follows games played and time per game. A rate the sheet gives
 * without the counts behind it is used to fill in the count the sheet left out, where there is one.
 * Nothing here runs on a line the sheet did not touch.
 */
export function reconcileImportedLine(
  type: 'skater' | 'goalie',
  scoring: Record<string, number>,
  utility: Record<string, number>,
  imported: ReadonlySet<StatKey>,
  previous: { readonly scoring: Readonly<Record<string, number>>; readonly gp: number },
): void {
  if (type === 'skater') {
    reconcileSkater(scoring, utility, imported, previous.scoring);
  } else {
    reconcileGoalie(scoring, utility, imported, previous.gp);
  }
}

function reconcileSkater(
  scoring: Record<string, number>,
  utility: Record<string, number>,
  imported: ReadonlySet<StatKey>,
  previous: Readonly<Record<string, number>>,
): void {
  const has = (key: StatKey) => imported.has(key);

  // A shooting percentage with goals but no shots names the shots.
  if (has('shPct') && has('goals') && !has('sog') && scoring['shPct'] > 0) {
    scoring['sog'] = scoring['goals'] / (scoring['shPct'] / 100);
  }

  sum(scoring, imported, 'points', 'goals', 'assists');
  // A power-play or shorthanded total the line had no split for is split the way the player's
  // points are, which the sheet has just given: a sniper's power-play points lean to goals too.
  sum(scoring, imported, 'ppp', 'ppg', 'ppa', ['goals', 'assists']);
  sum(scoring, imported, 'shp', 'shg', 'sha', ['goals', 'assists']);

  // Defencemen points are the points a player scores while eligible at defence, so they move with
  // his points by the share they already were of them.
  if (scoring['points'] !== previous['points'] && previous['defPoints'] > 0) {
    // A share of one or more is written as the points themselves, so a player who was a defenceman
    // all season does not come out a rounding error above them.
    const share = previous['points'] > 0 ? previous['defPoints'] / previous['points'] : 1;
    scoring['defPoints'] = share >= 1 ? scoring['points'] : share * scoring['points'];
  }

  // Special teams is only ever the power play and the penalty kill added up, so it has no value of
  // its own to keep once either of those has moved.
  if (['ppg', 'ppa', 'ppp', 'shg', 'sha', 'shp'].some((key) => has(key as StatKey))) {
    scoring['stpg'] = scoring['ppg'] + scoring['shg'];
    scoring['stpa'] = scoring['ppa'] + scoring['sha'];
    scoring['stp'] = scoring['stpg'] + scoring['stpa'];
  }

  if ((has('goals') || has('sog') || has('points') || has('shPct')) && scoring['sog'] > 0) {
    scoring['shPct'] = (scoring['goals'] / scoring['sog']) * 100;
  }

  if (has('gp') || has('toiPerGame')) {
    scoring['toi'] = utility['gp'] * utility['toiPerGame'];
  } else if (has('toi') && utility['gp'] > 0) {
    utility['toiPerGame'] = scoring['toi'] / utility['gp'];
  }
}

function reconcileGoalie(
  scoring: Record<string, number>,
  utility: Record<string, number>,
  imported: ReadonlySet<StatKey>,
  previousGames: number,
): void {
  const has = (key: StatKey) => imported.has(key);

  if (has('gp') && !has('toi')) {
    // A goalie's minutes follow his games, at the minutes a game the line already had, or a full
    // sixty where it had none.
    const perGame = previousGames > 0 ? scoring['toi'] / previousGames : 3600;
    scoring['toi'] = utility['gp'] * perGame;
  }

  // GAA and goals against name the minutes between them, or one names the other.
  if (has('gaa') && has('ga') && !has('toi') && scoring['gaa'] > 0) {
    scoring['toi'] = (scoring['ga'] * 3600) / scoring['gaa'];
  } else if (has('gaa') && !has('ga')) {
    scoring['ga'] = (scoring['gaa'] * scoring['toi']) / 3600;
  }

  // A save percentage with goals against but no shots names the shots.
  if (has('svPct') && !has('sa') && !has('sv') && scoring['svPct'] > 0 && scoring['svPct'] < 1) {
    scoring['sa'] = scoring['ga'] / (1 - scoring['svPct']);
    scoring['sv'] = scoring['sa'] - scoring['ga'];
  }

  sum(scoring, imported, 'sa', 'sv', 'ga');

  if ((has('sv') || has('sa') || has('ga') || has('svPct') || has('gaa')) && scoring['sa'] > 0) {
    scoring['svPct'] = scoring['sv'] / scoring['sa'];
  }
  if ((has('ga') || has('gaa') || has('gp') || has('toi')) && scoring['toi'] > 0) {
    scoring['gaa'] = (scoring['ga'] * 3600) / scoring['toi'];
  }
  const decisions = scoring['w'] + scoring['l'] + scoring['otl'];
  if ((has('w') || has('l') || has('otl') || has('winPct')) && decisions > 0) {
    scoring['winPct'] = scoring['w'] / decisions;
  }
}

/** Makes `total` equal `a + b`, by the rule in the comment above. */
function sum(
  stats: Record<string, number>,
  imported: ReadonlySet<StatKey>,
  total: StatKey,
  a: StatKey,
  b: StatKey,
  fallbackSplit?: readonly [StatKey, StatKey],
): void {
  const hasTotal = imported.has(total);
  const hasA = imported.has(a);
  const hasB = imported.has(b);
  if (hasA && hasB) {
    stats[total] = stats[a] + stats[b];
  } else if (hasTotal && hasA) {
    stats[b] = Math.max(0, stats[total] - stats[a]);
    stats[total] = stats[a] + stats[b];
  } else if (hasTotal && hasB) {
    stats[a] = Math.max(0, stats[total] - stats[b]);
    stats[total] = stats[a] + stats[b];
  } else if (hasTotal) {
    const parts = stats[a] + stats[b];
    const fallback = fallbackSplit ? stats[fallbackSplit[0]] + stats[fallbackSplit[1]] : 0;
    if (parts > 0) {
      stats[a] = (stats[a] * stats[total]) / parts;
      stats[b] = stats[total] - stats[a];
    } else if (fallbackSplit && fallback > 0) {
      stats[a] = (stats[fallbackSplit[0]] * stats[total]) / fallback;
      stats[b] = stats[total] - stats[a];
    }
    // With nothing at all to split by, the line cannot say how the total divides, and inventing a
    // split would be a guess dressed as data; the table's warning says so instead.
  } else if (hasA || hasB) {
    stats[total] = stats[a] + stats[b];
  }
}
