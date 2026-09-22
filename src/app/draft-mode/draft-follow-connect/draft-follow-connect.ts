import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DraftSettings } from '../../api/models/draft-settings';
import { LeagueProjectionSettingsResponse } from '../../api/models/league-projection-settings-response';
import { YahooService } from '../../services/yahoo.service';
import { IconComponent } from '../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import { isYahooRefusal } from '../../shared/yahoo-refused';
import { YahooLeaguePicker } from '../../shared/yahoo-league-picker';
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
  providers: [YahooLeaguePicker],
  templateUrl: './draft-follow-connect.html',
  styleUrl: './draft-follow-connect.css',
})
export class DraftFollowConnectComponent implements OnInit {
  private readonly yahoo = inject(YahooService);
  private readonly destroyRef = inject(DestroyRef);
  /** Connecting the account and choosing a league: the same picker the other screens use. */
  private readonly picker = inject(YahooLeaguePicker);

  /** The draft's own league settings, to tell whether the Yahoo league's differ from them. */
  readonly current = input<DraftSettings | null>(null);

  readonly linked = output<FollowLeagueLink>();
  readonly cancelled = output<void>();

  readonly connected = this.picker.connected;
  readonly connecting = this.picker.connecting;
  readonly leagues = this.picker.leagues;
  readonly loadingLeagues = this.picker.loadingLeagues;
  readonly selectedKey = this.picker.selectedKey;
  readonly loadingSettings = signal(false);
  /** What went wrong: the picker's failures and this dialog's own, in one line on screen. */
  readonly error = this.picker.error;
  /**
   * What the chosen league's settings would change, once they are known. Empty while the league is
   * still being chosen; a non-empty list is the question put to the user.
   */
  readonly differences = signal<string[]>([]);
  /** Whether the league's settings couldn't be read, leaving its picks as all there is to take. */
  readonly settingsFailed = signal(false);
  private readonly leagueSettings = signal<LeagueProjectionSettingsResponse | null>(null);

  ngOnInit(): void {
    this.picker.start();
  }

  connect(): void {
    this.picker.connect();
  }

  onLeagueChange(event: Event): void {
    this.picker.select(event);
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
}
