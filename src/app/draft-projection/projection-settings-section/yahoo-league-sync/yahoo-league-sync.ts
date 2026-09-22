import { Component, inject, input, linkedSignal, OnInit, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { YahooService } from '../../../services/yahoo.service';
import { YahooConnectReturnService } from '../../../services/yahoo-connect-return.service';
import { environment } from '../../../../environments/environment';
import { LeagueSummary } from '../../../api/models/league-summary';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';
import { YahooSync } from '../../../api/models/yahoo-sync';
import { IconComponent } from '../../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../../shared/loading-indicator/loading-indicator';
import { isYahooRefusal } from '../../../shared/yahoo-refused';
import { leaveFor } from '../../../shared/leave-for';
import { YahooMarkComponent } from '../../../shared/yahoo-mark/yahoo-mark';

export interface YahooSyncResult {
  settings: LeagueProjectionSettingsResponse;
  leagueName: string;
  leagueKey: string;
}

/**
 * Connect a user's own Yahoo account and copy a chosen league's scoring + roster settings
 * into the projection. Emits the mapped settings plus the league identity; the parent
 * applies them and persists which league was synced (and when) via the lastSync input.
 */
@Component({
  selector: 'app-yahoo-league-sync',
  imports: [DatePipe, IconComponent, LoadingIndicatorComponent, YahooMarkComponent],
  templateUrl: './yahoo-league-sync.html',
  styleUrl: './yahoo-league-sync.css',
})
export class YahooLeagueSyncComponent implements OnInit {
  private readonly yahoo = inject(YahooService);
  private readonly router = inject(Router);
  private readonly connectReturn = inject(YahooConnectReturnService);

  /**
   * Manual off-season switch (build-time `YAHOO_SYNC_DISABLED`). Between NHL seasons Yahoo has
   * no leagues to sync, so the template hides the connect/sync controls behind a plain note
   * instead of letting users hit confusing "could not load your leagues" errors.
   */
  protected readonly syncDisabled = environment.yahooSyncDisabled;

  readonly lastSync = input<YahooSync | null>(null);
  readonly synced = output<YahooSyncResult>();

  readonly connected = signal<boolean | null>(null);
  readonly connecting = signal(false);
  readonly leagues = signal<LeagueSummary[]>([]);
  readonly loadingLeagues = signal(false);
  readonly selectedKey = linkedSignal<string | null>(() => this.lastSync()?.leagueKey ?? null);
  readonly syncing = signal(false);
  readonly error = signal<string | null>(null);
  readonly unsupportedStats = signal<string[]>([]);

  ngOnInit(): void {
    if (this.syncDisabled) {
      return;
    }
    this.yahoo.connectionStatus().subscribe({
      next: (status) => {
        this.connected.set(status.connected);
        if (status.connected) {
          this.loadLeagues();
        }
      },
      error: () => this.connected.set(false),
    });
  }

  connect(): void {
    this.connecting.set(true);
    this.error.set(null);
    // Yahoo's consent leaves the app; remember this page so the claim on the way back ends here
    // rather than on projections. This component sits on several pages, so the page decides.
    this.connectReturn.remember(this.router.url);
    this.yahoo.startConnect().subscribe({
      next: (response) => {
        leaveFor(response.authorizeUrl, () => this.connecting.set(false));
      },
      error: () => {
        this.connecting.set(false);
        this.error.set("Couldn't start the Yahoo connection.");
      },
    });
  }

  onLeagueChange(event: Event): void {
    this.selectedKey.set((event.target as HTMLSelectElement).value || null);
    this.unsupportedStats.set([]);
  }

  sync(): void {
    const key = this.selectedKey();
    if (!key) {
      return;
    }
    const league = this.leagues().find((candidate) => candidate.leagueKey === key);
    this.syncing.set(true);
    this.error.set(null);
    this.unsupportedStats.set([]);
    this.yahoo.leagueProjectionSettings(key).subscribe({
      next: (settings) => {
        this.syncing.set(false);
        this.synced.emit({
          settings,
          leagueName: league?.name ?? 'your league',
          leagueKey: key,
        });
        this.unsupportedStats.set(settings.unsupportedStats);
      },
      error: (err: unknown) => {
        this.syncing.set(false);
        this.error.set(
          isYahooRefusal(err)
            ? "Yahoo refused access to this league's settings."
            : 'Could not load the league settings from Yahoo.',
        );
      },
    });
  }

  private loadLeagues(): void {
    this.loadingLeagues.set(true);
    this.yahoo.myLeagues().subscribe({
      next: (response) => {
        this.leagues.set(response.leagues);
        if (!this.lastSync() && response.leagues.length === 1) {
          this.selectedKey.set(response.leagues[0].leagueKey);
        }
        this.loadingLeagues.set(false);
      },
      error: (err: unknown) => {
        this.loadingLeagues.set(false);
        this.error.set(
          isYahooRefusal(err)
            ? 'Yahoo refused access to your leagues.'
            : 'Could not load your Yahoo leagues.',
        );
      },
    });
  }
}
