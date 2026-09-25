import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, switchMap } from 'rxjs';
import { DraftSettings } from '../../api/models/draft-settings';
import { LeagueProjectionSettingsResponse } from '../../api/models/league-projection-settings-response';
import { EspnService } from '../../services/espn.service';
import { YahooService } from '../../services/yahoo.service';
import { EspnCookieHelpComponent } from '../../shared/espn-cookie-help/espn-cookie-help';
import { IconComponent } from '../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import { isYahooRefusal } from '../../shared/yahoo-refused';
import { YahooLeaguePicker } from '../../shared/yahoo-league-picker';
import { YahooMarkComponent } from '../../shared/yahoo-mark/yahoo-mark';
import { leagueSettingsDifferences } from '../league-settings-difference';

/** A platform whose league a board can be linked to from the board itself. */
export type LinkPlatform = 'Yahoo' | 'ESPN';

/**
 * A followed ESPN league that needs the user's cookies before it can be followed: ESPN refused its
 * draft, or no team in it could be told apart as the user's.
 */
export interface CookieRepair {
  leagueId: string;
  /** Why the cookies are asked for, shown in place of the dialog's usual lead. */
  reason: string;
}

/** The league to follow, and the settings to import with it — none when the user keeps their own. */
export interface FollowLeagueLink {
  platform: LinkPlatform;
  /** Yahoo's league key, or ESPN's league id. */
  leagueId: string;
  leagueName: string;
  settings: LeagueProjectionSettingsResponse | null;
}

/**
 * Links a Yahoo or ESPN league to a draft that was set up without one, from inside the board, and
 * hands it back for the board to follow. Yahoo: connect the account if it isn't, pick the league.
 * ESPN, which has no account to connect: the league id and the user's espn_s2 and SWID cookies,
 * stored server-side as the settings import stores them. The cookies are asked for whatever the
 * league's privacy: without the SWID no team in a league can be told apart as the user's, and a
 * draft that cannot find its user's team cannot be followed. Once stored they are not asked again.
 *
 * With `repair` set it asks only for the cookies of a league already linked, and hands the link
 * back as soon as ESPN takes them: the league and its settings are the board's already.
 *
 * The league's settings are a separate question from its picks, so they are only imported when
 * they would change something the user set, and then only if they say so — a draft in progress is
 * ranked by the settings it was started with, and re-ranking it mid-draft is not something to do
 * behind their back.
 */
@Component({
  selector: 'app-draft-follow-connect',
  imports: [
    NgTemplateOutlet,
    IconComponent,
    LoadingIndicatorComponent,
    YahooMarkComponent,
    EspnCookieHelpComponent,
  ],
  providers: [YahooLeaguePicker],
  templateUrl: './draft-follow-connect.html',
  styleUrl: './draft-follow-connect.css',
})
export class DraftFollowConnectComponent implements OnInit {
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);
  private readonly destroyRef = inject(DestroyRef);
  /** Connecting the account and choosing a league: the same picker the other screens use. */
  private readonly picker = inject(YahooLeaguePicker);

  /** The draft's own league settings, to tell whether the league's differ from them. */
  readonly current = input<DraftSettings | null>(null);
  /** The platforms this environment follows drafts on, in the order the tabs show them. */
  readonly platforms = input<readonly LinkPlatform[]>(['Yahoo']);
  /** The platform to open on, when the page knows: the one a Yahoo connect just came back from. */
  readonly startOn = input<LinkPlatform | null>(null);
  /** A followed ESPN league whose cookies are missing or refused, when that is why this opened. */
  readonly repair = input<CookieRepair | null>(null);

  readonly linked = output<FollowLeagueLink>();
  readonly cancelled = output<void>();

  /**
   * The tab showing. Where the page names none, ESPN when the draft's league was last imported
   * from ESPN, since that is the league the user is most likely drafting in; otherwise the first.
   */
  readonly platform = linkedSignal<LinkPlatform>(() => {
    if (this.repair()) {
      return 'ESPN';
    }
    const offered = this.platforms();
    const asked = this.startOn();
    if (asked && offered.includes(asked)) {
      return asked;
    }
    if (this.current()?.lastEspnLeagueId && offered.includes('ESPN')) {
      return 'ESPN';
    }
    return offered[0] ?? 'Yahoo';
  });

  readonly connected = this.picker.connected;
  readonly connecting = this.picker.connecting;
  readonly leagues = this.picker.leagues;
  readonly loadingLeagues = this.picker.loadingLeagues;
  readonly selectedKey = this.picker.selectedKey;

  /** The ESPN league id: the repaired league's, or the one the draft last imported settings from. */
  readonly espnLeagueId = linkedSignal<string>(
    () => this.repair()?.leagueId ?? this.current()?.lastEspnLeagueId ?? '',
  );
  readonly espnS2 = signal('');
  readonly swid = signal('');
  readonly hasStoredCookies = signal(false);
  private readonly espnError = signal<string | null>(null);
  /** ESPN's name for the league, once its settings have been read. */
  private readonly espnLeagueName = signal<string | null>(null);

  readonly loadingSettings = signal(false);
  /** What went wrong on the tab showing, in one line on screen. */
  readonly error = computed(() =>
    this.platform() === 'ESPN' ? this.espnError() : this.picker.error(),
  );
  /**
   * Whether the ESPN cookies must be pasted before going on: when none are stored, and always when
   * repairing, since the stored pair is what ESPN just refused or could not place the user by.
   */
  readonly cookiesRequired = computed(() => !!this.repair() || !this.hasStoredCookies());
  /** Whether the chosen league can be taken: a Yahoo league picked, or an ESPN id and cookies. */
  readonly canChoose = computed(() => {
    if (this.platform() !== 'ESPN') {
      return !!this.selectedKey();
    }
    const cookiesGiven = this.espnS2().trim().length > 0 && this.swid().trim().length > 0;
    return this.espnLeagueId().trim().length > 0 && (cookiesGiven || !this.cookiesRequired());
  });
  /**
   * What the chosen league's settings would change, once they are known. Empty while the league is
   * still being chosen; a non-empty list is the question put to the user.
   */
  readonly differences = signal<string[]>([]);
  /** Whether the league's settings couldn't be read, leaving its picks as all there is to take. */
  readonly settingsFailed = signal(false);
  private readonly leagueSettings = signal<LeagueProjectionSettingsResponse | null>(null);
  private yahooStarted = false;
  private espnStarted = false;

  ngOnInit(): void {
    this.startPlatform(this.platform());
  }

  /** Switches tab. Each platform is only asked about once its tab has been opened. */
  choosePlatform(platform: LinkPlatform): void {
    this.platform.set(platform);
    this.settingsFailed.set(false);
    this.startPlatform(platform);
  }

  connect(): void {
    this.picker.connect();
  }

  onLeagueChange(event: Event): void {
    this.picker.select(event);
    this.settingsFailed.set(false);
  }

  onEspnLeagueIdInput(event: Event): void {
    this.espnLeagueId.set((event.target as HTMLInputElement).value);
    this.espnError.set(null);
    this.settingsFailed.set(false);
  }

  onEspnS2Input(event: Event): void {
    this.espnS2.set((event.target as HTMLInputElement).value);
  }

  onSwidInput(event: Event): void {
    this.swid.set((event.target as HTMLInputElement).value);
  }

  /**
   * Takes the chosen league. Its settings are read first, only to see whether they differ: where
   * they don't, there is nothing to ask and the board starts following at once.
   */
  choose(): void {
    if (!this.canChoose() || this.loadingSettings()) {
      return;
    }
    if (this.platform() === 'ESPN') {
      this.chooseEspn();
    } else {
      this.chooseYahoo();
    }
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

  private startPlatform(platform: LinkPlatform): void {
    if (platform === 'Yahoo' && !this.yahooStarted) {
      this.yahooStarted = true;
      this.picker.start();
    }
    if (platform === 'ESPN' && !this.espnStarted) {
      this.espnStarted = true;
      // A failed probe counts as none stored: the fields are then required, which costs a paste at
      // worst, where guessing the other way would link a league that cannot be followed.
      this.espn
        .credentialStatus()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (status) => this.hasStoredCookies.set(status.hasCredentials),
          error: () => this.hasStoredCookies.set(false),
        });
    }
  }

  private chooseYahoo(): void {
    const key = this.selectedKey();
    if (!key) {
      return;
    }
    this.readSettings(this.yahoo.leagueProjectionSettings(key), (err) => {
      // Following needs the league's picks, not its settings, so a settings read that fails is
      // not a reason to refuse the link: it only means there is nothing to import, which the
      // user is told rather than left to wonder about.
      this.settingsFailed.set(true);
      this.picker.error.set(
        isYahooRefusal(err)
          ? "Yahoo refused access to this league's settings. Its picks can still be followed."
          : "Couldn't read this league's settings. Its picks can still be followed.",
      );
    });
  }

  private chooseEspn(): void {
    const leagueId = this.espnLeagueId().trim();
    const espnS2 = this.espnS2().trim();
    const swid = this.swid().trim();
    // Empty fields keep the stored pair; a pasted pair replaces it.
    const savingCookies = espnS2.length > 0 && swid.length > 0;
    this.espnError.set(null);
    const save: Observable<void> = savingCookies
      ? this.espn.saveCredentials({ espnS2, swid })
      : of(undefined);
    const settings = save.pipe(
      switchMap(() => {
        if (savingCookies) {
          this.hasStoredCookies.set(true);
        }
        return this.espn.leagueProjectionSettings(leagueId);
      }),
    );
    this.readSettings(settings, (err) => {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      // ESPN refusing the league, or not knowing it, refuses its draft just the same, so there is
      // nothing to follow either: the fix is in the fields above.
      if (status === 400) {
        this.espnError.set(
          'ESPN did not accept those cookies. Check the league ID and make sure espn_s2 and SWID were copied in full.',
        );
        return;
      }
      if (status === 404) {
        this.espnError.set('No ESPN league found for that id.');
        return;
      }
      this.settingsFailed.set(true);
      this.espnError.set("Couldn't read this league's settings. Its picks can still be followed.");
    });
  }

  private readSettings(
    settings: Observable<LeagueProjectionSettingsResponse>,
    onError: (err: unknown) => void,
  ): void {
    this.loadingSettings.set(true);
    this.picker.error.set(null);
    settings.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (read) => {
        this.loadingSettings.set(false);
        this.espnLeagueName.set(read.leagueName ?? null);
        // Repairing, the settings were read only to prove ESPN takes the cookies: whether they
        // differ is a question already settled when the league was linked.
        if (this.repair()) {
          this.emitLink(null);
          return;
        }
        const differences = leagueSettingsDifferences(this.current(), read);
        if (differences.length === 0) {
          this.emitLink(read);
          return;
        }
        this.leagueSettings.set(read);
        this.differences.set(differences);
      },
      error: (err: unknown) => {
        this.loadingSettings.set(false);
        onError(err);
      },
    });
  }

  private emitLink(settings: LeagueProjectionSettingsResponse | null): void {
    if (this.platform() === 'ESPN') {
      const leagueId = this.espnLeagueId().trim();
      if (!leagueId) {
        return;
      }
      this.linked.emit({
        platform: 'ESPN',
        leagueId,
        leagueName: this.espnLeagueName() ?? leagueId,
        settings,
      });
      return;
    }
    const key = this.selectedKey();
    if (!key) {
      return;
    }
    const league = this.leagues().find((candidate) => candidate.leagueKey === key);
    this.linked.emit({
      platform: 'Yahoo',
      leagueId: key,
      leagueName: league?.name ?? 'your league',
      settings,
    });
  }
}
