import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { Api } from '../api/api';
import { yahooLeague } from '../api/fn/league-summaries/yahoo-league';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';

/** Where a league's teams stand, totalled by the BFF. */
@Injectable({ providedIn: 'root' })
export class LeagueSummaryService {
  private readonly api = inject(Api);

  /**
   * Totals a Yahoo league's teams: each one's current roster, or its picks until the draft is over.
   *
   * <p>The league key is the whole of what goes out: the rosters, the teams and the scoring
   * settings are read from the league itself, server-side. Nothing here chooses the rosters,
   * which is what lets the totals be shown to an account that may not see the lines behind them.
   */
  yahooLeague(leagueKey: string): Observable<LeagueSummaryResponse> {
    return from(this.api.invoke(yahooLeague, { leagueKey }));
  }
}
