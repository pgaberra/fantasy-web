import { Component, inject, OnInit, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, switchMap } from 'rxjs';
import { EspnService } from '../../../services/espn.service';
import { LeagueProjectionSettingsResponse } from '../../../api/models/league-projection-settings-response';

/**
 * Sync a chosen ESPN league's scoring + roster settings into the projection. ESPN has no OAuth,
 * so instead of a connect flow the user gives a league id (+ season) and, for a private league,
 * their espn_s2 + SWID cookies (stored server-side so they aren't re-entered). Emits the mapped
 * settings; the parent applies them.
 */
@Component({
  selector: 'app-espn-league-sync',
  templateUrl: './espn-league-sync.html',
  styleUrl: './espn-league-sync.css',
})
export class EspnLeagueSyncComponent implements OnInit {
  private readonly espn = inject(EspnService);

  readonly synced = output<LeagueProjectionSettingsResponse>();

  readonly season = signal<number>(this.currentSeasonStartYear());
  readonly leagueId = signal<string>('');
  readonly isPrivate = signal<boolean>(false);
  readonly espnS2 = signal<string>('');
  readonly swid = signal<string>('');
  readonly hasStoredCredentials = signal<boolean>(false);
  readonly showHelp = signal<boolean>(false);
  readonly syncing = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly syncedLeagueId = signal<string | null>(null);
  readonly unsupportedStats = signal<string[]>([]);

  ngOnInit(): void {
    this.espn.credentialStatus().subscribe({
      next: (status) => this.hasStoredCredentials.set(status.hasCredentials),
      // Best-effort: if the status probe fails we just show the cookie inputs (the safe default —
      // the user can always re-enter them), so there's nothing to surface to the user here.
      error: () => this.hasStoredCredentials.set(false),
    });
  }

  onSeasonInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.season.set(Math.trunc(parsed));
    }
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
    const season = this.season();
    const espnS2 = this.espnS2().trim();
    const swid = this.swid().trim();
    const savingCookies = this.isPrivate() && espnS2.length > 0 && swid.length > 0;

    this.error.set(null);
    this.unsupportedStats.set([]);
    this.syncing.set(true);

    const start = savingCookies ? this.espn.saveCredentials({ espnS2, swid }) : of(undefined);
    start.pipe(switchMap(() => this.espn.leagueProjectionSettings(leagueId, season))).subscribe({
      next: (settings) => {
        this.syncing.set(false);
        this.syncedLeagueId.set(leagueId);
        this.unsupportedStats.set(settings.unsupportedStats);
        if (savingCookies) {
          this.hasStoredCredentials.set(true);
        }
        this.synced.emit(settings);
      },
      error: (err: unknown) => {
        this.syncing.set(false);
        this.error.set(this.messageForError(err));
      },
    });
  }

  private messageForError(err: unknown): string {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    if (status === 400) {
      return 'This league looks private, or the cookies are invalid. Check the league id and your espn_s2 / SWID values.';
    }
    if (status === 404) {
      return 'No ESPN league found for that id and season.';
    }
    return 'Could not load the league settings from ESPN. Please try again.';
  }

  private currentSeasonStartYear(): number {
    const now = new Date();
    // The NHL season is identified by its starting year and opens in October, so before then the
    // current fantasy season is still the previous calendar year's.
    return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  }
}
