import { Component, inject, OnInit, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, switchMap } from 'rxjs';
import { EspnService } from '../../../services/espn.service';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';

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
 * The private-league checkbox starts unticked on purpose. Reading two cookies out of the browser's
 * dev tools is the heaviest thing this flow asks for, and a public league needs none of it — so
 * the cookie fields stay closed until ESPN has actually refused the league, at which point this
 * component ticks the box itself.
 */
@Component({
  selector: 'app-espn-league-sync',
  templateUrl: './espn-league-sync.html',
  styleUrl: './espn-league-sync.css',
})
export class EspnLeagueSyncComponent implements OnInit {
  private readonly espn = inject(EspnService);

  readonly synced = output<EspnSyncResult>();

  readonly leagueId = signal<string>('');
  readonly isPrivate = signal<boolean>(false);
  readonly espnS2 = signal<string>('');
  readonly swid = signal<string>('');
  readonly hasStoredCredentials = signal<boolean>(false);
  /** Set once ESPN has rejected the stored cookies, so the form stops offering to reuse them. */
  readonly storedCredentialsRefused = signal<boolean>(false);
  readonly showHelp = signal<boolean>(false);
  readonly syncing = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly syncedLeagueId = signal<string | null>(null);
  readonly syncedLeagueName = signal<string | null>(null);
  readonly unsupportedStats = signal<string[]>([]);

  ngOnInit(): void {
    this.espn.credentialStatus().subscribe({
      next: (status) => this.hasStoredCredentials.set(status.hasCredentials),
      // Best-effort: if the status probe fails we just show the cookie inputs (the safe default —
      // the user can always re-enter them), so there's nothing to surface to the user here.
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
    const savingCookies = this.isPrivate() && espnS2.length > 0 && swid.length > 0;

    this.error.set(null);
    this.unsupportedStats.set([]);
    this.storedCredentialsRefused.set(false);
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
          // Stored cookies that were just refused are not something to offer reusing.
          this.storedCredentialsRefused.set(this.hasStoredCredentials() && !savingCookies);
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
