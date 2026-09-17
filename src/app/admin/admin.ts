import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { AdminService } from '../services/admin.service';
import { AdminPremiumComponent } from './premium/admin-premium';
import { LeagueSummary, SyncRunResponse, YahooProbeResponse } from '../api/models';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { yahooRefusalMessage } from '../shared/yahoo-refused';
import { leaveFor } from '../shared/leave-for';

/**
 * What the Yahoo callback said about the connect attempt it just finished, in words rather than
 * a slug. Anything unrecognised falls back to the generic line -- a new slug from the service
 * must not render as a blank banner.
 */
const CONNECT_OUTCOMES: Record<string, string> = {
  declined:
    'Yahoo did not return an authorization code. The consent step was declined or cancelled.',
  invalid_state:
    'The connection link had expired before Yahoo sent you back. Press reconnect and approve it ' +
    'without pausing. The link is good for ten minutes.',
  link_expired:
    "The Yahoo connection wasn't saved. Its link had expired or was already used. Press reconnect.",
  wrong_account:
    "The Yahoo connection wasn't saved. It was started from a different SlapStat account.",
  claim_failed: "Couldn't save the Yahoo connection. Press reconnect to try again.",
  exchange_failed:
    'Yahoo refused to exchange the code for a token. That is Yahoo turning us away, not a ' +
    'mis-click. Check the app registration and its Fantasy Sports permission.',
};

/**
 * Yahoo's own OAuth error code, when it sent one. Worth a sentence of its own: "declined" covers
 * both someone pressing no and Yahoo refusing to let the app ask at all, and those call for
 * completely different responses.
 */
const YAHOO_ERRORS: Record<string, string> = {
  access_denied: 'Yahoo reported that the request was declined.',
  invalid_scope:
    'Yahoo rejected the fspt-r scope outright. This app is no longer allowed to ask for ' +
    'Fantasy Sports data. Retrying will not help.',
  unauthorized_client:
    'Yahoo does not accept this app for this flow. Check the client type and its API ' +
    'permissions. Retrying will not help.',
  invalid_request: 'Yahoo reported a malformed request.',
  unsupported_response_type: 'Yahoo rejected the response type requested by the app.',
  server_error: 'Yahoo reported an error on its side. Retrying may help.',
  temporarily_unavailable: 'Yahoo is temporarily unavailable. Retrying may help.',
};

@Component({
  selector: 'app-admin',
  imports: [RelativeTimePipe, AdminPremiumComponent, LoadingIndicatorComponent],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly route = inject(ActivatedRoute);

  /** Set when we have just come back from Yahoo, so the round trip does not end in silence. */
  readonly connectOutcome = signal<'connected' | 'error' | null>(null);
  readonly connectMessage = signal<string | null>(null);

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
    this.readConnectOutcome();
    this.loadConnection();
    this.loadRuns();
    this.loadLeagues();
  }

  private readConnectOutcome(): void {
    // Params are typed `any` by the router; narrow once here rather than at every use.
    const params = this.route.snapshot.queryParams as Record<string, string | undefined>;
    const outcome = params['yahoo'];
    if (outcome !== 'connected' && outcome !== 'error') {
      return;
    }
    const reason = params['reason'];
    const detail = params['detail'];
    const explained = reason ? CONNECT_OUTCOMES[reason] : undefined;
    const fromYahoo = detail ? YAHOO_ERRORS[detail] : undefined;
    const failure =
      explained ?? 'Yahoo did not complete the connection and did not provide a reason.';
    this.connectOutcome.set(outcome);
    this.connectMessage.set(
      outcome === 'connected'
        ? 'Yahoo account connected.'
        : [failure, fromYahoo].filter(Boolean).join(' '),
    );
  }

  dismissConnectOutcome(): void {
    this.connectOutcome.set(null);
    this.connectMessage.set(null);
  }

  loadLeagues(): void {
    this.leaguesError.set(null);
    this.adminService.yahooLeagues().subscribe({
      next: (response) => this.leagues.set(response.leagues ?? []),
      error: (err: unknown) =>
        this.leaguesError.set(
          yahooRefusalMessage(err) || "Yahoo would not list the service account's leagues.",
        ),
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
        this.error.set("Couldn't load the Yahoo connection status.");
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
        leaveFor(response.authorizeUrl, () => this.connecting.set(false));
      },
      error: () => {
        this.connecting.set(false);
        this.error.set("Couldn't start the Yahoo connection.");
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

  /**
   * The floor question: can this account list its own leagues at all? Nothing else is sent,
   * because a refusal here is not about which endpoint was picked — it is about whether any
   * route into the Fantasy API is open to us.
   */
  runLeaguesProbe(): void {
    this.runProbe('leagues');
  }

  runProbe(target?: string): void {
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
        target,
      )
      .subscribe({
        next: (result) => {
          this.probing.set(false);
          this.probeResult.set(result);
        },
        error: () => {
          this.probing.set(false);
          this.probeError.set(
            "Couldn't reach the Yahoo probe. This appears to be a problem on our side.",
          );
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
        this.syncMessage.set('Sync started. Waiting for the result…');
        this.pollForNewRun(beforeId, 0);
      },
      error: () => {
        this.syncing.set(false);
        this.error.set("Couldn't start the sync.");
      },
    });
  }

  private pollForNewRun(beforeId: number | null, attempt: number): void {
    if (attempt >= 20) {
      this.syncing.set(false);
      this.syncMessage.set('Sync is taking longer than expected. Refresh to check the status.');
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
