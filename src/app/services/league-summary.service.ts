import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { Api } from '../api/api';
import { draftSummary } from '../api/fn/league-summaries/draft-summary';
import { espnLeague } from '../api/fn/league-summaries/espn-league';
import { yahooLeague } from '../api/fn/league-summaries/yahoo-league';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { RankBy, rankByParams } from '../team-power-rankings/rank-by';

/** Where a league's teams stand, totalled by the BFF. */
@Injectable({ providedIn: 'root' })
export class LeagueSummaryService {
  private readonly api = inject(Api);

  /**
   * Totals a Yahoo league's teams: each one's current roster, or its picks until the draft is over.
   *
   * <p>The league key, and which projection to rank by, is the whole of what goes out: the rosters, the teams and the scoring
   * settings are read from the league itself, server-side. Nothing here chooses the rosters,
   * which is what lets the totals be shown to an account that may not see the lines behind them.
   * A board is named by its id and read server-side too, never posted from here.
   *
   * @param rankBy what the players are scored against: the model unless told otherwise
   */
  yahooLeague(leagueKey: string, rankBy: RankBy = 'model'): Observable<LeagueSummaryResponse> {
    return from(this.api.invoke(yahooLeague, { leagueKey, ...rankByParams(rankBy) }));
  }

  /**
   * Totals an ESPN league's teams: each one's current roster, which is its picks so far while the
   * draft runs. As with a Yahoo league only the id goes out; the rosters and scoring are read from
   * ESPN server-side, with the user's stored cookies where the league is private.
   *
   * @param rankBy what the players are scored against: the model unless told otherwise
   */
  espnLeague(leagueId: string, rankBy: RankBy = 'model'): Observable<LeagueSummaryResponse> {
    return from(this.api.invoke(espnLeague, { leagueId, ...rankByParams(rankBy) }));
  }

  /**
   * Totals one of the user's own drafts: each team's picks, in the draft's own league. Only the id
   * goes out; the teams, picks and scoring are read server-side, as a league's are.
   *
   * @param rankBy what the players are scored against: the model unless told otherwise
   */
  draft(draftId: string, rankBy: RankBy = 'model'): Observable<LeagueSummaryResponse> {
    return from(this.api.invoke(draftSummary, { draftId, ...rankByParams(rankBy) }));
  }
}
