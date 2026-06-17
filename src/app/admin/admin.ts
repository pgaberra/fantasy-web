import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { AdminService } from '../services/admin.service';
import { SyncRunResponse } from '../api/models';

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

  readonly runs = signal<SyncRunResponse[]>([]);
  readonly latestRun = computed<SyncRunResponse | null>(() => this.runs()[0] ?? null);

  ngOnInit(): void {
    this.loadConnection();
    this.loadRuns();
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
