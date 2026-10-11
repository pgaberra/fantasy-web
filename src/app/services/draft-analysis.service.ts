import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { Api } from '../api/api';
import { yahooDraftAnalysis } from '../api/fn/draft-analysis/yahoo-draft-analysis';
import { DraftAnalysisResponse } from '../api/models/draft-analysis-response';

/** A league's draft, every pick graded against the AI projection by the BFF. */
@Injectable({ providedIn: 'root' })
export class DraftAnalysisService {
  private readonly api = inject(Api);

  /**
   * Grades a Yahoo league's draft. The league key is the whole of what goes out: the picks, the
   * teams and the scoring settings are read from Yahoo server-side, as Team Power Rankings reads
   * them.
   */
  yahoo(leagueKey: string): Observable<DraftAnalysisResponse> {
    return from(this.api.invoke(yahooDraftAnalysis, { leagueKey }));
  }
}
