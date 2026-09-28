import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { EspnService } from '../../services/espn.service';
import { EspnCookieHelpComponent } from '../../shared/espn-cookie-help/espn-cookie-help';
import { IconComponent } from '../../shared/icon/icon';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';

/**
 * A followed ESPN league that needs the user's cookies before it can be followed: ESPN refused its
 * draft, or no team in it could be told apart as the user's.
 */
export interface CookieRepair {
  leagueId: string;
  /** Why the cookies are asked for, shown as the dialog's lead. */
  reason: string;
}

/**
 * Asks for the user's espn_s2 and SWID cookies for an ESPN league the draft is already linked to,
 * and says so once ESPN takes them. Linking a league is the draft settings' import; this is the
 * one thing that import does not ask. The cookies are wanted whatever the league's privacy:
 * without the SWID no team in a league can be told apart as the user's, and a draft that cannot
 * find its user's team cannot be followed. They are stored server-side as the settings import
 * stores them, and always pasted afresh here, since the stored pair is what ESPN just refused or
 * could not place the user by.
 *
 * The league's settings are read only to prove ESPN takes the cookies: the league and its
 * settings are the board's already.
 */
@Component({
  selector: 'app-draft-follow-connect',
  imports: [IconComponent, LoadingIndicatorComponent, EspnCookieHelpComponent],
  templateUrl: './draft-follow-connect.html',
  styleUrl: './draft-follow-connect.css',
})
export class DraftFollowConnectComponent {
  private readonly espn = inject(EspnService);
  private readonly destroyRef = inject(DestroyRef);

  /** The followed ESPN league whose cookies are missing or refused. */
  readonly repair = input.required<CookieRepair>();

  /** ESPN took the cookies for the league asked about. */
  readonly repaired = output<void>();
  readonly cancelled = output<void>();

  readonly espnS2 = signal('');
  readonly swid = signal('');
  /** What went wrong, in one line on screen. */
  readonly error = signal<string | null>(null);

  readonly checking = signal(false);
  /** Whether both cookies have been pasted. */
  readonly canSave = computed(
    () => this.espnS2().trim().length > 0 && this.swid().trim().length > 0,
  );
  /** Whether the league's settings couldn't be read, leaving its picks as all there is to take. */
  readonly settingsFailed = signal(false);

  onEspnS2Input(event: Event): void {
    this.espnS2.set((event.target as HTMLInputElement).value);
  }

  onSwidInput(event: Event): void {
    this.swid.set((event.target as HTMLInputElement).value);
  }

  /** Stores the pasted cookies, then reads the league with them to see that ESPN takes them. */
  save(): void {
    if (!this.canSave() || this.checking()) {
      return;
    }
    const leagueId = this.repair().leagueId;
    this.error.set(null);
    this.checking.set(true);
    this.espn
      .saveCredentials({ espnS2: this.espnS2().trim(), swid: this.swid().trim() })
      .pipe(
        switchMap(() => this.espn.leagueProjectionSettings(leagueId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.checking.set(false);
          this.repaired.emit();
        },
        error: (err: unknown) => {
          this.checking.set(false);
          this.fail(err);
        },
      });
  }

  /** Goes on to the picks although the league's settings could not be read. */
  followAnyway(): void {
    this.repaired.emit();
  }

  cancel(): void {
    this.cancelled.emit();
  }

  private fail(err: unknown): void {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    // ESPN refusing the league, or not knowing it, refuses its draft just the same, so there is
    // nothing to follow either.
    if (status === 400) {
      this.error.set(
        'ESPN did not accept those cookies. Check the league ID and make sure espn_s2 and SWID were copied in full.',
      );
      return;
    }
    if (status === 404) {
      this.error.set('No ESPN league found for that id.');
      return;
    }
    // Following needs the league's picks, not its settings, so a settings read that fails is not
    // a reason to refuse: the user is told, and may go on.
    this.settingsFailed.set(true);
    this.error.set("Couldn't read this league's settings. Its picks can still be followed.");
  }
}
