import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LeagueSummary } from '../../api/models/league-summary';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import {
  PlannerLeague,
  StreamerPlannerLeagueService,
} from '../../services/streamer-planner-league.service';
import { YahooService } from '../../services/yahoo.service';

/** The dropdown's value for an ESPN league, which is typed rather than picked from a list. */
export const ESPN_OPTION = 'espn';

/**
 * The league the planner reads free agents from, as one field of the report settings: a dropdown
 * of the account's Yahoo leagues, with an ESPN league as the last choice, typed by its id.
 *
 * <p>A Yahoo league is read the moment it is picked, since nothing here is saved or sent anywhere
 * but to be read (the same rule as Team Power Rankings). An ESPN id is not read until "Use" says
 * the reader has finished typing it. The choice is remembered on this device by
 * {@link StreamerPlannerLeagueService}, so the field opens on last time's league.
 */
@Component({
  selector: 'app-league-field',
  imports: [FormsModule, LoadingIndicatorComponent],
  templateUrl: './league-field.html',
  styleUrl: './league-field.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeagueFieldComponent {
  private readonly leagueService = inject(StreamerPlannerLeagueService);
  private readonly yahoo = inject(YahooService);

  readonly league = this.leagueService.league;
  readonly espnOption = ESPN_OPTION;

  private readonly yahooLeaguesResource = rxResource({ stream: () => this.yahoo.myLeagues() });

  readonly loadingLeagues = computed(() => this.yahooLeaguesResource.isLoading());
  readonly yahooFailed = computed(() => !!this.yahooLeaguesResource.error());

  /**
   * The Yahoo leagues to offer: the account's, and the remembered one where it is not among them
   * (the list failed to load, or the league has gone), so the field can still say what is chosen.
   */
  readonly yahooLeagues = computed<readonly LeagueSummary[]>(() => {
    const loaded = this.yahooLeaguesResource.hasValue()
      ? this.yahooLeaguesResource.value().leagues
      : [];
    const remembered = this.league();
    if (
      remembered?.platform === 'YAHOO' &&
      !loaded.some((league) => league.leagueKey === remembered.leagueId)
    ) {
      return [{ leagueKey: remembered.leagueId, name: remembered.name }, ...loaded];
    }
    return loaded;
  });

  /** Whether the ESPN choice is open, its id still to be typed or changed. */
  readonly espnChosen = signal(false);

  /** The id in the ESPN box: last time's, until the reader types another. */
  readonly espnLeagueId = linkedSignal<PlannerLeague | null, string>({
    source: this.league,
    computation: (league) => (league?.platform === 'ESPN' ? league.leagueId : ''),
  });

  readonly selectedValue = computed(() => {
    if (this.espnChosen()) {
      return ESPN_OPTION;
    }
    const league = this.league();
    if (!league) {
      return '';
    }
    return league.platform === 'ESPN' ? ESPN_OPTION : league.leagueId;
  });

  readonly showsEspnId = computed(() => this.espnChosen() || this.league()?.platform === 'ESPN');

  select(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === ESPN_OPTION) {
      this.espnChosen.set(true);
      return;
    }
    this.espnChosen.set(false);
    if (!value) {
      this.leagueService.forget();
      return;
    }
    const league = this.yahooLeagues().find((candidate) => candidate.leagueKey === value);
    if (league) {
      this.leagueService.choose({
        platform: 'YAHOO',
        leagueId: league.leagueKey,
        name: league.name,
      });
    }
  }

  useEspn(): void {
    const leagueId = this.espnLeagueId().trim();
    if (!leagueId) {
      return;
    }
    this.leagueService.choose({ platform: 'ESPN', leagueId, name: `ESPN league ${leagueId}` });
    this.espnChosen.set(false);
  }
}
