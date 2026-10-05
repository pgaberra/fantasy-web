import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { LeagueSummary } from '../api/models/league-summary';
import { LeagueChoiceService } from '../services/league-choice.service';
import { YahooService } from '../services/yahoo.service';
import { YahooConnectReturnService } from '../services/yahoo-connect-return.service';
import { isYahooRefusal } from './yahoo-refused';
import { leaveFor } from './leave-for';

/**
 * Picking one of the user's own Yahoo leagues: connect the account if it isn't, load the leagues,
 * hold the chosen one.
 *
 * <p>Every screen that asks for a league asks the same four questions in the same order — is the
 * account connected, which leagues are on it, which one do you mean, and what went wrong — so
 * they are answered once here rather than copied per screen. What differs between screens is what
 * happens to the chosen league, and that stays theirs.
 *
 * <p>Not root-provided: each screen gets its own, so the connection is re-checked when a screen
 * opens rather than remembered from whenever the app started. The league itself is shared: a
 * screen opens on the one last chosen anywhere ({@link LeagueChoiceService}), and a league picked
 * here is the one the next screen opens on.
 */
@Injectable()
export class YahooLeaguePicker {
  private readonly yahoo = inject(YahooService);
  private readonly router = inject(Router);
  private readonly connectReturn = inject(YahooConnectReturnService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly choice = inject(LeagueChoiceService);

  /** Whether the account is connected to Yahoo; null while that is still being asked. */
  readonly connected = signal<boolean | null>(null);
  readonly connecting = signal(false);
  readonly leagues = signal<LeagueSummary[]>([]);
  readonly loadingLeagues = signal(false);
  readonly selectedKey = signal<string | null>(null);
  /** What went wrong, in the reader's terms. Writable: a screen's own failures show up here too. */
  readonly error = signal<string | null>(null);

  /**
   * Checks the connection and, when there is one, loads the leagues behind it.
   *
   * @param openOnRemembered whether to start on the Yahoo league last chosen anywhere. A screen
   *     that already knows what it means (a link naming a draft) says no.
   */
  start(openOnRemembered = true): void {
    this.selectedKey.set(openOnRemembered ? (this.choice.on('YAHOO')?.leagueId ?? null) : null);
    this.yahoo
      .connectionStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.connected.set(status.connected);
          if (status.connected) {
            this.loadLeagues();
          }
        },
        error: () => this.connected.set(false),
      });
  }

  /**
   * Sends the user to Yahoo's consent. It leaves the app, so where they are now is remembered:
   * the claim on the way back lands them on the page that asked, not on a default one.
   */
  connect(): void {
    this.connecting.set(true);
    this.error.set(null);
    this.connectReturn.remember(this.router.url);
    this.yahoo
      .startConnect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => leaveFor(response.authorizeUrl, () => this.connecting.set(false)),
        error: () => {
          this.connecting.set(false);
          this.error.set("Couldn't start the Yahoo connection.");
        },
      });
  }

  /**
   * Takes the league a `<select>` changed to, clearing whatever the last one said went wrong, and
   * remembers it for the next screen. Going back to the placeholder is choosing no league.
   */
  select(event: Event): void {
    const key = (event.target as HTMLSelectElement).value || null;
    this.selectedKey.set(key);
    this.error.set(null);
    const league = this.selectedLeague();
    if (league) {
      this.choice.choose({ platform: 'YAHOO', leagueId: league.leagueKey, name: league.name });
    } else if (!key) {
      this.choice.forget();
    }
  }

  /** The chosen league, for its name — the key alone is not something to show anybody. */
  selectedLeague(): LeagueSummary | undefined {
    const key = this.selectedKey();
    return key ? this.leagues().find((league) => league.leagueKey === key) : undefined;
  }

  reloadLeagues(): void {
    this.error.set(null);
    this.loadLeagues();
  }

  private loadLeagues(): void {
    this.loadingLeagues.set(true);
    this.yahoo
      .myLeagues()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.leagues.set(response.leagues);
          this.dropUnlisted(response.leagues);
          // One league is not a choice; picking it for them saves a step without taking one.
          if (!this.selectedKey() && response.leagues.length === 1) {
            const only = response.leagues[0];
            this.selectedKey.set(only.leagueKey);
            if (!this.choice.league()) {
              this.choice.choose({ platform: 'YAHOO', leagueId: only.leagueKey, name: only.name });
            }
          }
          this.loadingLeagues.set(false);
        },
        error: (err: unknown) => {
          this.loadingLeagues.set(false);
          this.error.set(
            isYahooRefusal(err)
              ? 'Yahoo refused access to your leagues.'
              : 'Could not load your Yahoo leagues.',
          );
        },
      });
  }

  /**
   * A remembered league the account no longer lists — last season's, or one the user has left —
   * is not one to open on, nor to open on next time.
   */
  private dropUnlisted(leagues: readonly LeagueSummary[]): void {
    const key = this.selectedKey();
    if (!key || leagues.some((league) => league.leagueKey === key)) {
      return;
    }
    this.selectedKey.set(null);
    if (this.choice.on('YAHOO')?.leagueId === key) {
      this.choice.forget();
    }
  }
}
