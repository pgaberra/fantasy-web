import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { FeatureService } from '../services/feature.service';
import { LeagueSummaryService } from '../services/league-summary.service';
import { YahooService } from '../services/yahoo.service';
import { LeagueProjectionTableComponent } from '../draft-mode/league-projection-table/league-projection-table';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { leagueProjectionFrom, scoreHeadingFor } from './league-summary-data';

/**
 * How a league's draft turned out, for a manager who drafted on Yahoo rather than here.
 *
 * <p>Nothing is saved. The page is a read of a league that already exists somewhere else, so it
 * holds no board, no draft and no row of its own: leaving it and coming back reads the league
 * again. That is also why the picks are never posted — the league key is the whole of what this
 * page sends, and the BFF reads the rosters from Yahoo itself.
 *
 * <p>The totals are everyone's; the players behind them are Premium's. Which is why the numbers
 * are computed on the server and this page only draws them.
 */
@Component({
  selector: 'app-league-summary',
  imports: [
    RouterLink,
    LeagueProjectionTableComponent,
    ErrorStateComponent,
    IconComponent,
    LoadingIndicatorComponent,
  ],
  templateUrl: './league-summary.html',
  styleUrl: './league-summary.css',
})
export class LeagueSummaryComponent {
  private readonly yahoo = inject(YahooService);
  private readonly summaries = inject(LeagueSummaryService);
  private readonly features = inject(FeatureService);

  /** The league being read, once one is picked. */
  readonly leagueKey = signal<string | null>(null);

  readonly offered = computed(() => this.features.leagueDraftSync());

  private readonly leaguesResource = rxResource({
    stream: () => this.yahoo.myLeagues(),
  });

  readonly leagues = computed(() =>
    this.leaguesResource.hasValue() ? this.leaguesResource.value().leagues : [],
  );
  readonly loadingLeagues = computed(() => this.leaguesResource.isLoading());
  readonly leaguesError = computed(() => this.leaguesResource.error());

  private readonly summaryResource = rxResource({
    params: () => this.leagueKey() ?? undefined,
    stream: ({ params }) => this.summaries.yahooLeague(params),
  });

  readonly loadingSummary = computed(() => this.summaryResource.isLoading());
  readonly summary = computed<LeagueSummaryResponse | null>(() =>
    this.summaryResource.hasValue() ? this.summaryResource.value() : null,
  );
  readonly summaryError = computed(() => this.summaryResource.error());

  readonly leagueName = computed(() => {
    const key = this.leagueKey();
    return this.leagues().find((league) => league.leagueKey === key)?.name ?? '';
  });

  readonly leagueProjection = computed(() => {
    const summary = this.summary();
    return summary ? leagueProjectionFrom(summary) : null;
  });

  readonly scoringType = computed(() =>
    this.summary()?.scoringType === 'category' ? ('category' as const) : ('points' as const),
  );

  readonly scoreHeading = computed(() => {
    const summary = this.summary();
    return summary ? scoreHeadingFor(summary) : 'Total Points';
  });

  /** Whether the players behind each total came back, which is what Premium pays for. */
  readonly hasPlayers = computed(() => !!this.summary()?.premium);

  /** Whether to sell Premium here at all: not in a build with no way to buy anything. */
  readonly sellsPremium = computed(() => environment.paymentsEnabled && !this.hasPlayers());

  /** A league nobody has drafted in yet has totals, but they are all nothing. */
  readonly notDrafted = computed(() => {
    const summary = this.summary();
    return !!summary && summary.picks === 0;
  });

  readonly scoredAgainst = computed(() =>
    this.summary()?.source === 'last_season' ? "last season's stats" : 'the AI projection',
  );

  /**
   * What went wrong, in the reader's terms. A refusal from Yahoo and a league this environment
   * will not read are different problems with different answers, and neither is "try again".
   */
  readonly summaryMessage = computed(() => {
    const error = this.summaryError();
    if (!error) {
      return null;
    }
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 404) {
      return "This league can't be read here. Check that your Yahoo account is still connected.";
    }
    if (status === 424) {
      return 'Yahoo refused access to this league. Reconnect your Yahoo account and try again.';
    }
    return 'Check your connection and try again.';
  });

  choose(leagueKey: string): void {
    this.leagueKey.set(leagueKey);
  }

  /** Back to the list, to read a different league. */
  chooseAnother(): void {
    this.leagueKey.set(null);
  }

  retryLeagues(): void {
    this.leaguesResource.reload();
  }

  retrySummary(): void {
    this.summaryResource.reload();
  }
}
