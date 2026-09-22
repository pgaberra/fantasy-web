import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { DraftSettings } from '../../api/models/draft-settings';
import { LeagueProjectionSettingsResponse } from '../../api/models/league-projection-settings-response';
import { LeagueSummary } from '../../api/models/league-summary';
import { YahooService } from '../../services/yahoo.service';
import { YahooConnectReturnService } from '../../services/yahoo-connect-return.service';
import { IconComponent } from '../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import { isYahooRefusal } from '../../shared/yahoo-refused';
import { leaveFor } from '../../shared/leave-for';
import { leagueSettingsDifferences } from '../league-settings-difference';

/** The league to follow, and the settings to import with it — none when the user keeps their own. */
export interface FollowLeagueLink {
  leagueKey: string;
  leagueName: string;
  settings: LeagueProjectionSettingsResponse | null;
}

/**
 * Links a Yahoo league to a draft that was set up without one, from inside the board: connect the
 * account if it isn't, pick the league, and hand it back for the board to follow.
 *
 * The league's settings are a separate question from its picks, so they are only imported when
 * they would change something the user set, and then only if they say so — a draft in progress is
 * ranked by the settings it was started with, and re-ranking it mid-draft is not something to do
 * behind their back.
 */
@Component({
  selector: 'app-draft-follow-connect',
  imports: [IconComponent, LoadingIndicatorComponent],
  templateUrl: './draft-follow-connect.html',
  styleUrl: './draft-follow-connect.css',
})
export class DraftFollowConnectComponent implements OnInit {
  private readonly yahoo = inject(YahooService);
  private readonly router = inject(Router);
  private readonly connectReturn = inject(YahooConnectReturnService);
  private readonly destroyRef = inject(DestroyRef);

  /** The draft's own league settings, to tell whether the Yahoo league's differ from them. */
  readonly current = input<DraftSettings | null>(null);

  readonly linked = output<FollowLeagueLink>();
  readonly cancelled = output<void>();

  readonly connected = signal<boolean | null>(null);
  readonly connecting = signal(false);
  readonly leagues = signal<LeagueSummary[]>([]);
  readonly loadingLeagues = signal(false);
  readonly selectedKey = signal<string | null>(null);
  readonly loadingSettings = signal(false);
  readonly error = signal<string | null>(null);
  /**
   * What the chosen league's settings would change, once they are known. Empty while the league is
   * still being chosen; a non-empty list is the question put to the user.
   */
  readonly differences = signal<string[]>([]);
  /** Whether the league's settings couldn't be read, leaving its picks as all there is to take. */
  readonly settingsFailed = signal(false);
  private readonly leagueSettings = signal<LeagueProjectionSettingsResponse | null>(null);

  ngOnInit(): void {
    this.yahoo
      .connectionStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
    // Yahoo's consent leaves the app; the board is where the user should land on the way back,
    // with this dialog open again on it.
    this.connectReturn.remember(this.router.url);
    this.yahoo
      .startConnect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => leaveFor(response.authorizeUrl, () => this.connecting.set(false)),
        error: () => {
          this.connecting.set(false);
          this.error.set("Couldn't start the Yahoo connection.");
        },
      });
  }

  onLeagueChange(event: Event): void {
    this.selectedKey.set((event.target as HTMLSelectElement).value || null);
    this.error.set(null);
    this.settingsFailed.set(false);
  }

  /**
   * Takes the chosen league. Its settings are read first, only to see whether they differ: where
   * they don't, there is nothing to ask and the board starts following at once.
   */
  choose(): void {
    const key = this.selectedKey();
    if (!key || this.loadingSettings()) {
      return;
    }
    this.loadingSettings.set(true);
    this.error.set(null);
    this.yahoo
      .leagueProjectionSettings(key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.loadingSettings.set(false);
          const differences = leagueSettingsDifferences(this.current(), settings);
          if (differences.length === 0) {
            this.emitLink(settings);
            return;
          }
          this.leagueSettings.set(settings);
          this.differences.set(differences);
        },
        // Following needs the league's picks, not its settings, so a settings read that fails is
        // not a reason to refuse the link: it only means there is nothing to import, which the
        // user is told rather than left to wonder about.
        error: (err: unknown) => {
          this.loadingSettings.set(false);
          this.settingsFailed.set(true);
          this.error.set(
            isYahooRefusal(err)
              ? "Yahoo refused access to this league's settings. Its picks can still be followed."
              : "Couldn't read this league's settings. Its picks can still be followed.",
          );
        },
      });
  }

  keepMySettings(): void {
    this.emitLink(null);
  }

  useLeagueSettings(): void {
    this.emitLink(this.leagueSettings());
  }

  cancel(): void {
    this.cancelled.emit();
  }

  private emitLink(settings: LeagueProjectionSettingsResponse | null): void {
    const key = this.selectedKey();
    if (!key) {
      return;
    }
    const league = this.leagues().find((candidate) => candidate.leagueKey === key);
    this.linked.emit({
      leagueKey: key,
      leagueName: league?.name ?? 'your league',
      settings,
    });
  }

  private loadLeagues(): void {
    this.loadingLeagues.set(true);
    this.yahoo
      .myLeagues()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.leagues.set(response.leagues);
          if (response.leagues.length === 1) {
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
