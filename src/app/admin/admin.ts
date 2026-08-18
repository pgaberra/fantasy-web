import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { AdminService } from '../services/admin.service';
import { LeagueSummary, SyncRunResponse, YahooProbeResponse } from '../api/models';

@Component({
  selector: 'app-admin',
  imports: [RelativeTimePipe],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly connected = signal<boolean | null>(null);
  readonly connecting = signal(false);
  readonly syncing = signal(false);
  readonly syncMessage = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  // The probe is a diagnostic, so its inputs are deliberately free-form: the whole value is
  // being able to vary one of them at a time and read what Yahoo says back.
  readonly probeGameKey = signal('nhl');
  readonly probeSeason = signal('');
  readonly probeLeagueKey = signal('');

  /**
   * The service account's leagues. Loaded because a league key is otherwise a thing you have to
   * go and find, and because the call succeeding at all says the account and its permission are
   * in order — which narrows a refusal elsewhere to what was asked for.
   */
  readonly leagues = signal<LeagueSummary[]>([]);
  readonly leaguesError = signal<string | null>(null);
  readonly probing = signal(false);
  readonly probeResult = signal<YahooProbeResponse | null>(null);
  readonly probeError = signal<string | null>(null);

  readonly runs = signal<SyncRunResponse[]>([]);
  readonly latestRun = computed<SyncRunResponse | null>(() => this.runs()[0] ?? null);

  ngOnInit(): void {
    this.loadConnection();
    this.loadRuns();
    this.loadLeagues();
  }

  loadLeagues(): void {
    this.leaguesError.set(null);
    this.adminService.yahooLeagues().subscribe({
      next: (response) => this.leagues.set(response.leagues ?? []),
      error: () => this.leaguesError.set("Yahoo would not list the service account's leagues."),
    });
  }

  useLeagueKey(leagueKey: string): void {
    this.probeLeagueKey.set(leagueKey);
  }

  loadConnection(): void {
    this.connected.set(null);
    this.error.set(null);
    this.adminService.yahooConnection().subscribe({
      next: (response) => this.connected.set(response.connected),
      error: () => {
        this.connected.set(false);
        this.error.set('Could not load the Yahoo connection status.');
      },
    });
  }

  loadRuns(): void {
    this.adminService.syncRuns(8).subscribe({
      next: (runs) => this.runs.set(runs),
      error: () => {
        /* a missing run history is not worth surfacing as an error */
      },
    });
  }

  connectYahoo(): void {
    this.connecting.set(true);
    this.error.set(null);
    this.adminService.connectYahoo().subscribe({
      next: (response) => {
        window.location.href = response.authorizeUrl;
      },
      error: () => {
        this.connecting.set(false);
        this.error.set('Could not start the Yahoo connection.');
      },
    });
  }

  onProbeGameKeyInput(event: Event): void {
    this.probeGameKey.set((event.target as HTMLInputElement).value);
  }

  onProbeSeasonInput(event: Event): void {
    this.probeSeason.set((event.target as HTMLInputElement).value);
  }

  onProbeLeagueKeyInput(event: Event): void {
    this.probeLeagueKey.set((event.target as HTMLInputElement).value);
  }

  runProbe(): void {
    this.probing.set(true);
    this.probeResult.set(null);
    this.probeError.set(null);
    const season = this.probeSeason().trim();
    const leagueKey = this.probeLeagueKey().trim();
    this.adminService
      .probeYahooAccess(
        this.probeGameKey().trim() || 'nhl',
        season || undefined,
        leagueKey || undefined,
      )
      .subscribe({
        next: (result) => {
          this.probing.set(false);
          this.probeResult.set(result);
        },
        error: () => {
          this.probing.set(false);
          this.probeError.set('Could not reach the probe itself — that is our side, not Yahoo.');
        },
      });
  }

  runSync(): void {
    this.syncing.set(true);
    this.syncMessage.set(null);
    this.error.set(null);
    const beforeId = this.latestRun()?.id ?? null;
    this.adminService.triggerSync().subscribe({
      next: () => {
        this.syncMessage.set('Sync started — waiting for the result…');
        this.pollForNewRun(beforeId, 0);
      },
      error: () => {
        this.syncing.set(false);
        this.error.set('Could not start the sync.');
      },
    });
  }

  private pollForNewRun(beforeId: number | null, attempt: number): void {
    if (attempt >= 20) {
      this.syncing.set(false);
      this.syncMessage.set('Sync is taking longer than expected — use Refresh to check.');
      return;
    }
    setTimeout(() => {
      this.adminService.syncRuns(8).subscribe({
        next: (runs) => {
          this.runs.set(runs);
          if (runs[0] && runs[0].id !== beforeId) {
            this.syncing.set(false);
            this.syncMessage.set(null);
          } else {
            this.pollForNewRun(beforeId, attempt + 1);
          }
        },
        error: () => this.pollForNewRun(beforeId, attempt + 1),
      });
    }, 6000);
  }
}
