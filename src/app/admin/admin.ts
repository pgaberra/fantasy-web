import { Component, inject, OnInit, signal } from '@angular/core';
import { AdminService } from '../services/admin.service';

@Component({
  selector: 'app-admin',
  imports: [],
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

  ngOnInit(): void {
    this.loadConnection();
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
    this.adminService.triggerSync().subscribe({
      next: () => {
        this.syncing.set(false);
        this.syncMessage.set('Sync started — player data will refresh shortly.');
      },
      error: () => {
        this.syncing.set(false);
        this.error.set('Could not start the sync.');
      },
    });
  }
}
