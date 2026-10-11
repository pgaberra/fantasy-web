import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  EspnLeagueSyncComponent,
  EspnSyncResult,
} from '../../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';
import { ChosenLeague } from '../../services/league-choice.service';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import { Platform, PlatformTabsComponent } from '../../shared/platform-tabs/platform-tabs';
import { YahooLeaguePicker } from '../../shared/yahoo-league-picker';

/**
 * The league the planner reads free agents from, as one field of the report settings, picked the
 * way Team Power Rankings picks one (Alexander's call, 2026-10-05): the same Yahoo / ESPN tabs,
 * under Yahoo a dropdown of the account's leagues, under ESPN the same card — league id, "My
 * league is private", the cookies.
 *
 * <p>A Yahoo league is read the moment it is picked, since nothing here is saved or sent anywhere
 * but to be read. An ESPN id is not read until the card's button says the reader has finished
 * typing it. Either is remembered for every page that picks a league, so the field opens on the
 * one last chosen anywhere. The page owns which tab is open and which ESPN league ESPN accepted,
 * and the Yahoo league is the page's {@link YahooLeaguePicker}'s, since the free agents follow all
 * three.
 */
@Component({
  selector: 'app-league-field',
  imports: [EspnLeagueSyncComponent, LoadingIndicatorComponent, PlatformTabsComponent],
  templateUrl: './league-field.html',
  styleUrl: './league-field.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeagueFieldComponent {
  readonly picker = inject(YahooLeaguePicker);

  readonly platform = model.required<Platform>();
  readonly espnLeague = model<ChosenLeague | null>(null);

  /** Whether ESPN leagues are offered at all: where Team Power Rankings offers them. */
  protected readonly espnOffered = environment.espnLeaguesEnabled;
  protected readonly platforms: readonly Platform[] = ['yahoo', 'espn'];

  /** The ESPN league the card has just checked with ESPN, which the free agents now come from. */
  readEspn(result: EspnSyncResult): void {
    this.espnLeague.set({
      platform: 'ESPN',
      leagueId: result.leagueId,
      name: result.leagueName ?? `ESPN league ${result.leagueId}`,
    });
  }
}
