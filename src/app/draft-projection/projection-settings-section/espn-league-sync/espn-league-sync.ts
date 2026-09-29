import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { of, switchMap } from 'rxjs';
import { EspnService } from '../../../services/espn.service';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';
import { IconComponent } from '../../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../../shared/loading-indicator/loading-indicator';
import { EspnCookieHelpComponent } from '../../../shared/espn-cookie-help/espn-cookie-help';
import { CookieFieldDirective } from '../../../shared/cookie-field/cookie-field';

/**
 * What the league is read for: its settings, imported into a board, or its teams, ranked by Team
 * Power Rankings. The form, the cookies and the errors are the same either way; only what the
 * card is called and what its button says differ.
 */
export type EspnLeaguePurpose = 'settings' | 'rankings';

export interface EspnSyncResult {
  settings: LeagueProjectionSettingsResponse;
  leagueId: string;
  /** ESPN's own name for the league. Absent only if ESPN returned a league without one. */
  leagueName?: string;
}

/**
 * Sync a chosen ESPN league's scoring + roster settings into the projection. ESPN has no OAuth,
 * so instead of a connect flow the user gives a league id and, for a private league,
 * their espn_s2 + SWID cookies (stored server-side so they aren't re-entered). Emits the mapped
 * settings; the parent applies them.
 *
 * The private-league checkbox starts unticked. Reading two cookies out of the browser's dev tools
 * is the heaviest thing this flow asks for, and a public league needs none of it. It ticks itself
 * only on evidence about this league: ESPN has just refused it. Cookies on file are no such
 * evidence — they belong to the account, not a league, and following a public league's draft
 * stored them too while Draft Mode followed ESPN drafts — and the box does not change the sync
 * anyway: the server uses the stored pair whether it is ticked or not, so all it gates is the
 * fields for pasting a new one.
 *
 * A returning user finds the league id they synced last time. The stored cookies are never read
 * back: the pair is a session credential for the whole ESPN account, and it stays on the server.
 *
 * Team Power Rankings asks for its ESPN league with this same card (`purpose="rankings"`), so an
 * ESPN league is picked the same way wherever it is picked. The settings read is then only the
 * proof that ESPN takes the league and the cookies; what the page reads next is the league's teams.
 */
@Component({
  selector: 'app-espn-league-sync',
  imports: [
    DatePipe,
    IconComponent,
    LoadingIndicatorComponent,
    EspnCookieHelpComponent,
    CookieFieldDirective,
  ],
  templateUrl: './espn-league-sync.html',
  styleUrl: './espn-league-sync.css',
})
export class EspnLeagueSyncComponent implements OnInit {
  private readonly espn = inject(EspnService);

  /** The league this projection was last synced from, so a re-sync isn't retyped from memory. */
  readonly lastLeagueId = input<string | null>(null);
  /** When that sync ran — the answer to "are these settings still the league's?". */
  readonly lastSyncedAt = input<string | null>(null);
  /** ESPN's name for that league, so the status line names it rather than its id. */
  readonly lastLeagueName = input<string | null>(null);
  readonly purpose = input<EspnLeaguePurpose>('settings');
  readonly synced = output<EspnSyncResult>();

  readonly leagueId = linkedSignal<string>(() => this.lastLeagueId() ?? '');
  readonly isPrivate = signal<boolean>(false);
  readonly espnS2 = signal<string>('');
  readonly swid = signal<string>('');
  readonly hasStoredCredentials = signal<boolean>(false);
  readonly syncing = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  // Follow the page's stamp, not the remembered id: a league synced on an earlier visit is still
  // linked (the button says Re-sync), and one disconnected since is not (it says Sync again).
  readonly syncedLeagueId = linkedSignal<string | null>(() =>
    this.lastSyncedAt() ? this.lastLeagueId() : null,
  );
  readonly syncedLeagueName = linkedSignal<string | null>(() =>
    this.lastSyncedAt() ? this.lastLeagueName() : null,
  );
  readonly unsupportedStats = signal<string[]>([]);
  /**
   * A league id is entered that isn't the one these settings came from, so syncing is the step
   * the user is here for: the button turns primary. A re-sync of the same league stays secondary.
   */
  readonly syncPending = computed(() => {
    const id = this.leagueId().trim();
    return id !== '' && id !== (this.syncedLeagueId() ?? this.lastLeagueId());
  });

  ngOnInit(): void {
    this.espn.credentialStatus().subscribe({
      next: (status) => this.hasStoredCredentials.set(status.hasCredentials),
      // Best-effort: if the status probe fails the saved note just stays hidden (the user can
      // always re-enter the cookies), so there's nothing to surface to the user here.
      error: () => this.hasStoredCredentials.set(false),
    });
  }

  onLeagueIdInput(event: Event): void {
    this.leagueId.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  togglePrivate(): void {
    this.isPrivate.update((isPrivate) => !isPrivate);
  }

  onEspnS2Input(event: Event): void {
    this.espnS2.set((event.target as HTMLInputElement).value);
  }

  onSwidInput(event: Event): void {
    this.swid.set((event.target as HTMLInputElement).value);
  }

  sync(): void {
    const leagueId = this.leagueId().trim();
    if (!leagueId) {
      this.error.set('Enter your ESPN league id.');
      return;
    }
    const espnS2 = this.espnS2().trim();
    const swid = this.swid().trim();
    // Empty fields keep the stored pair; a pasted pair replaces it.
    const savingCookies = this.isPrivate() && espnS2.length > 0 && swid.length > 0;

    this.error.set(null);
    this.unsupportedStats.set([]);
    this.syncing.set(true);

    const start = savingCookies ? this.espn.saveCredentials({ espnS2, swid }) : of(undefined);
    start.pipe(switchMap(() => this.espn.leagueProjectionSettings(leagueId))).subscribe({
      next: (settings) => {
        this.syncing.set(false);
        this.syncedLeagueId.set(leagueId);
        this.syncedLeagueName.set(settings.leagueName ?? null);
        this.unsupportedStats.set(settings.unsupportedStats);
        if (savingCookies) {
          this.hasStoredCredentials.set(true);
        }
        this.synced.emit({ settings, leagueId, leagueName: settings.leagueName });
      },
      error: (err: unknown) => {
        this.syncing.set(false);
        const hadCredentials = savingCookies || this.hasStoredCredentials();
        // A 400 means ESPN wants cookies it did not get, or did not like the ones it did. Either
        // way the fix is in the cookie fields, so open them rather than leaving the error pointing
        // at inputs the user would first have to find a checkbox to reveal.
        if (this.isPrivateLeagueRefusal(err)) {
          this.isPrivate.set(true);
        }
        this.error.set(this.messageForError(err, hadCredentials));
      },
    });
  }

  private isPrivateLeagueRefusal(err: unknown): boolean {
    return err instanceof HttpErrorResponse && err.status === 400;
  }

  private messageForError(err: unknown, hadCredentials: boolean): string {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    if (status === 400) {
      return hadCredentials
        ? 'ESPN did not accept those cookies. Check the league ID and make sure espn_s2 and SWID were copied in full.'
        : 'This league is private. Add your espn_s2 and SWID cookies, then sync again.';
    }
    if (status === 404) {
      return 'No ESPN league found for that id.';
    }
    return "Couldn't load the league settings from ESPN. Please try again.";
  }
}
