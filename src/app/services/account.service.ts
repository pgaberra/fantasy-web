import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, from, map, tap } from 'rxjs';
import { Api } from '../api/api';
import { getAccount } from '../api/fn/account/get-account';
import { getAvatar } from '../api/fn/account/get-avatar';
import { removeAvatar } from '../api/fn/account/remove-avatar';
import { setAvatar } from '../api/fn/account/set-avatar';
import { setUsername } from '../api/fn/account/set-username';
import { AccountResponse } from '../api/models/account-response';
import { AuthService } from './auth.service';

/**
 * The signed-in account's own profile: its public name and its picture. Both are cached in
 * signals because the header draws them on every page, and the profile page and the share dialog
 * (which cannot publish without a name) ask for them too; none of those should have to re-fetch.
 *
 * The profile follows the session. When one starts, or is already there when the app boots, it is
 * loaded; when the session ends it is dropped, so the next person to sign in on this browser
 * never sees the last one's name or face for a moment.
 */
@Injectable({
  providedIn: 'root',
})
export class AccountService {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);

  private readonly account = signal<AccountResponse | null>(null);
  readonly username = signal<string | null>(null);
  // From the profile once it has loaded, and from the token's own claim until then, so the header
  // has something to show from the first frame.
  readonly email = computed(() => this.account()?.email ?? this.auth.getEmail());
  /**
   * An object URL for the picture, or null without one. The picture sits behind the bearer
   * token, which an <img src> cannot send, so it is fetched as a blob and handed to the image as
   * a URL of its own. Each new value revokes the one before it.
   */
  readonly avatarUrl = signal<string | null>(null);

  constructor() {
    effect(() => {
      const signedIn = this.auth.isLoggedIn();
      untracked(() => (signedIn ? this.follow() : this.forget()));
    });
  }

  load(): Observable<AccountResponse> {
    return from(this.api.invoke(getAccount, {})).pipe(tap((account) => this.remember(account)));
  }

  setUsername(username: string): Observable<AccountResponse> {
    return from(this.api.invoke(setUsername, { body: { username } })).pipe(
      tap((account) => this.remember(account)),
    );
  }

  loadAvatar(): Observable<Blob | null> {
    return from(this.api.invoke(getAvatar, {})).pipe(
      // The generated client types the body as a string; it asks for a blob, and an account
      // without a picture gets an empty 204, whose body is null.
      map((body: unknown) => (body instanceof Blob && body.size > 0 ? body : null)),
      tap((picture) => this.rememberAvatar(picture)),
    );
  }

  setAvatar(picture: Blob): Observable<void> {
    return from(this.api.invoke(setAvatar, { body: { file: picture } })).pipe(
      tap(() => this.rememberAvatar(picture)),
    );
  }

  removeAvatar(): Observable<void> {
    return from(this.api.invoke(removeAvatar, {})).pipe(tap(() => this.rememberAvatar(null)));
  }

  private follow(): void {
    // The header has a fallback for both (the first letter of the name, or of the email), and
    // the page underneath reports an outage in its own words; a second report from the header
    // would say nothing the page does not.
    this.load().subscribe({ error: () => undefined });
    this.loadAvatar().subscribe({ error: () => undefined });
  }

  private forget(): void {
    this.account.set(null);
    this.username.set(null);
    this.rememberAvatar(null);
  }

  private remember(account: AccountResponse): void {
    this.account.set(account);
    this.username.set(account.username ?? null);
  }

  private rememberAvatar(picture: Blob | null): void {
    const previous = this.avatarUrl();
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    this.avatarUrl.set(picture ? URL.createObjectURL(picture) : null);
  }
}
