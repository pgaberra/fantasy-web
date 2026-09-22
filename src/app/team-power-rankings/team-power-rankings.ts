import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { LeagueSummaryResponse } from '../api/models/league-summary-response';
import { FeatureService } from '../services/feature.service';
import { LeagueSummaryService } from '../services/league-summary.service';
import { LeagueProjectionTableComponent } from '../draft-mode/league-projection-table/league-projection-table';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { YahooLeaguePicker } from '../shared/yahoo-league-picker';
import { leagueProjectionFrom, scoreHeadingFor } from './power-rankings-data';
import { powerRankingsMessage, powerRankingsRetryable } from './power-rankings-error';

/**
 * How a league's teams stack up, for a manager who drafted on Yahoo rather than here.
 *
 * <p>Nothing is saved. The page is a read of a league that already exists somewhere else, so it
 * holds no board, no draft and no row of its own: leaving it and coming back reads the league
 * again. That is also why the picks are never posted — the league key is the whole of what this
 * page sends, and the BFF reads the rosters from Yahoo itself.
 *
 * <p>The totals are everyone's; the players behind them are Premium's. Which is why the numbers
 * are computed on the server and this page only draws them.
 *
 * <p>The league is picked the way every other screen picks one — the shared
 * {@link YahooLeaguePicker} behind a dropdown — so that choosing a league means the same thing
 * here as in draft setup. The dropdown stays put once a league is read, because reading a second
 * league is the obvious next thing to do and it should not cost a trip back to a list.
 */
@Component({
  selector: 'app-team-power-rankings',
  imports: [
    RouterLink,
    LeagueProjectionTableComponent,
    ErrorStateComponent,
    IconComponent,
    LoadingIndicatorComponent,
  ],
  providers: [YahooLeaguePicker],
  templateUrl: './team-power-rankings.html',
  styleUrl: './team-power-rankings.css',
})
export class TeamPowerRankingsComponent implements OnInit {
  private readonly rankings = inject(LeagueSummaryService);
  private readonly features = inject(FeatureService);

  /** The league picker every screen shares, so choosing a league means the same thing here. */
  readonly picker = inject(YahooLeaguePicker);

  /** The league being read: the chosen one, once it has been asked for. */
  readonly leagueKey = signal<string | null>(null);

  readonly offered = computed(() => this.features.leagueDraftSync());

  ngOnInit(): void {
    if (this.offered()) {
      this.picker.start();
    }
  }

  private readonly rankingsResource = rxResource({
    params: () => this.leagueKey() ?? undefined,
    stream: ({ params }) => this.rankings.yahooLeague(params),
  });

  readonly loadingRankings = computed(() => this.rankingsResource.isLoading());
  readonly rankingsData = computed<LeagueSummaryResponse | null>(() =>
    this.rankingsResource.hasValue() ? this.rankingsResource.value() : null,
  );
  readonly rankingsError = computed(() => this.rankingsResource.error());

  /** Whether the dropdown is pointing at a league other than the one on screen. */
  readonly canShow = computed(
    () => !!this.picker.selectedKey() && this.picker.selectedKey() !== this.leagueKey(),
  );

  readonly leagueName = computed(() => {
    const key = this.leagueKey();
    return this.picker.leagues().find((league) => league.leagueKey === key)?.name ?? '';
  });

  readonly leagueProjection = computed(() => {
    const rankings = this.rankingsData();
    return rankings ? leagueProjectionFrom(rankings) : null;
  });

  readonly scoringType = computed(() =>
    this.rankingsData()?.scoringType === 'category' ? ('category' as const) : ('points' as const),
  );

  readonly scoreHeading = computed(() => {
    const rankings = this.rankingsData();
    return rankings ? scoreHeadingFor(rankings) : 'Total Points';
  });

  /** Whether the players behind each total came back, which is what Premium pays for. */
  readonly hasPlayers = computed(() => !!this.rankingsData()?.premium);

  /** Whether to sell Premium here at all: not in a build with no way to buy anything. */
  readonly sellsPremium = computed(() => environment.paymentsEnabled && !this.hasPlayers());

  /** A league nobody has drafted in yet has totals, but they are all nothing. */
  readonly notDrafted = computed(() => {
    const rankings = this.rankingsData();
    return !!rankings && rankings.picks === 0;
  });

  /**
   * What went wrong, in the reader's terms, and whether trying again could answer differently.
   * A refusal the server will repeat word for word gets no button.
   */
  readonly rankingsMessage = computed(() => {
    const error = this.rankingsError();
    return error ? powerRankingsMessage(error) : null;
  });

  readonly rankingsRetryable = computed(() => powerRankingsRetryable(this.rankingsError()));

  /** Reads whatever the dropdown is pointing at. */
  show(): void {
    const key = this.picker.selectedKey();
    if (key) {
      this.leagueKey.set(key);
    }
  }

  retryRankings(): void {
    this.rankingsResource.reload();
  }
}
