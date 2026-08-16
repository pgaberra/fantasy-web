import { Component, inject, input, linkedSignal, OnInit, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { of, switchMap } from 'rxjs';
import { EspnService } from '../../../services/espn.service';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';
import { CredentialValuesResponse } from '../../../api/models/credential-values-response';

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
 * The private-league checkbox starts unticked for a user the app knows nothing about. Reading two
 * cookies out of the browser's dev tools is the heaviest thing this flow asks for, and a public
 * league needs none of it. It ticks itself on evidence: cookies already on file, or a league ESPN
 * has just refused.
 *
 * A returning user finds the form as they left it: the league id they synced last time, and the
 * stored cookies read back from the server. That read is what makes the prefill possible and is
 * also its cost — the pair is a session credential for the whole ESPN account, and from the
 * moment it is displayed it lives in the page rather than only on the server.
 */
@Component({
  selector: 'app-espn-league-sync',
  imports: [DatePipe],
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
  readonly synced = output<EspnSyncResult>();

  readonly leagueId = linkedSignal<string>(() => this.lastLeagueId() ?? '');
  readonly isPrivate = signal<boolean>(false);
  readonly espnS2 = signal<string>('');
  readonly swid = signal<string>('');
  readonly hasStoredCredentials = signal<boolean>(false);
  /** What the fields were filled from, so an untouched pair isn't written back on every sync. */
  private readonly storedCookies = signal<CredentialValuesResponse | null>(null);
  readonly showHelp = signal<boolean>(false);
  readonly syncing = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly syncedLeagueId = signal<string | null>(null);
  readonly syncedLeagueName = signal<string | null>(null);
  readonly unsupportedStats = signal<string[]>([]);

  ngOnInit(): void {
    this.espn.credentialStatus().subscribe({
      next: (status) => {
        this.hasStoredCredentials.set(status.hasCredentials);
        // Cookies on file mean the last sync was of a private league, so open the section the
        // way the user left it — and fill it in with what is stored.
        if (status.hasCredentials) {
          this.isPrivate.set(true);
          this.loadStoredCookies();
        }
      },
      // Best-effort: if the status probe fails we just show the cookie inputs (the safe default —
      // the user can always re-enter them), so there's nothing to surface to the user here.
      error: () => this.hasStoredCredentials.set(false),
    });
  }

  /**
   * Fills the cookie fields with the stored pair. Best-effort: if the read fails the fields stay
   * empty, which is the form's other working state — a sync with them blank reuses what the
   * server holds anyway.
   */
  private loadStoredCookies(): void {
    this.espn.credentialValues().subscribe({
      next: (cookies) => {
        this.espnS2.set(cookies.espnS2);
        this.swid.set(cookies.swid);
        this.storedCookies.set(cookies);
      },
      error: () => undefined,
    });
  }

  onLeagueIdInput(event: Event): void {
    this.leagueId.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  togglePrivate(): void {
    this.isPrivate.update((isPrivate) => !isPrivate);
  }

  toggleHelp(): void {
    this.showHelp.update((showHelp) => !showHelp);
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
    const stored = this.storedCookies();
    const edited = espnS2 !== stored?.espnS2 || swid !== stored?.swid;
    // The fields may be showing the pair we just read back, so only write when they differ from it.
    const savingCookies = this.isPrivate() && espnS2.length > 0 && swid.length > 0 && edited;

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
        ? 'ESPN would not accept those cookies. Check the league id, and that espn_s2 and SWID were copied in full.'
        : 'This league is private. Add your espn_s2 and SWID cookies, then sync again.';
    }
    if (status === 404) {
      return 'No ESPN league found for that id.';
    }
    return 'Could not load the league settings from ESPN. Please try again.';
  }
}
