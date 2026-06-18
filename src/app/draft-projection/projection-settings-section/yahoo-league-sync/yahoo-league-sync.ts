import { Component, inject, OnInit, output, signal } from '@angular/core';
import { YahooService } from '../../../services/yahoo.service';
import { LeagueSummary } from '../../../api/models/league-summary';
import { mapLeagueSettings, MappedLeagueSettings } from '../../../services/yahoo-league-mapping';

interface SyncSummary {
  leagueName: string;
  scoringType: string;
  unsupportedStats: string[];
  unsupportedRosterCodes: string[];
}

/**
 * Connect a user's own Yahoo account and copy a chosen league's scoring + roster settings
 * into the projection. Emits the mapped settings; the parent applies them to its signals.
 */
@Component({
  selector: 'app-yahoo-league-sync',
  templateUrl: './yahoo-league-sync.html',
  styleUrl: './yahoo-league-sync.css',
})
export class YahooLeagueSyncComponent implements OnInit {
  private readonly yahoo = inject(YahooService);

  readonly synced = output<MappedLeagueSettings>();

  readonly connected = signal<boolean | null>(null);
  readonly connecting = signal(false);
  readonly leagues = signal<LeagueSummary[]>([]);
  readonly loadingLeagues = signal(false);
  readonly selectedKey = signal<string | null>(null);
  readonly syncing = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<SyncSummary | null>(null);

  ngOnInit(): void {
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
    this.yahoo.startConnect().subscribe({
      next: (response) => {
        window.location.href = response.authorizeUrl;
      },
      error: () => {
        this.connecting.set(false);
        this.error.set('Could not start the Yahoo connection.');
      },
    });
  }

  onLeagueChange(event: Event): void {
    this.selectedKey.set((event.target as HTMLSelectElement).value || null);
    this.summary.set(null);
  }

  sync(): void {
    const key = this.selectedKey();
    if (!key) {
      return;
    }
    const league = this.leagues().find((candidate) => candidate.leagueKey === key);
    this.syncing.set(true);
    this.error.set(null);
    this.summary.set(null);
    this.yahoo.leagueSettings(key).subscribe({
      next: (settings) => {
        this.syncing.set(false);
        const result = mapLeagueSettings(settings, league?.numTeams);
        this.synced.emit(result.mapped);
        this.summary.set({
          leagueName: settings.name,
          scoringType: result.mapped.scoringType,
          unsupportedStats: result.unsupportedStats,
          unsupportedRosterCodes: result.unsupportedRosterCodes,
        });
      },
      error: () => {
        this.syncing.set(false);
        this.error.set('Could not load the league settings from Yahoo.');
      },
    });
  }

  private loadLeagues(): void {
    this.loadingLeagues.set(true);
    this.yahoo.myLeagues().subscribe({
      next: (response) => {
        this.leagues.set(response.leagues);
        if (response.leagues.length === 1) {
          this.selectedKey.set(response.leagues[0].leagueKey);
        }
        this.loadingLeagues.set(false);
      },
      error: () => {
        this.loadingLeagues.set(false);
        this.error.set('Could not load your Yahoo leagues.');
      },
    });
  }
}
