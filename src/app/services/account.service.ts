import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, tap } from 'rxjs';
import { Api } from '../api/api';
import { getAccount } from '../api/fn/account/get-account';
import { setUsername } from '../api/fn/account/set-username';
import { AccountResponse } from '../api/models/account-response';

/**
 * The signed-in account's own profile. The username is cached in a signal because two very
 * different places ask for it — the profile page and the share dialog, which cannot publish
 * without one — and neither should have to re-fetch to know whether it exists.
 */
@Injectable({
  providedIn: 'root',
})
export class AccountService {
  private readonly api = inject(Api);

  private readonly account = signal<AccountResponse | null>(null);
  readonly username = signal<string | null>(null);

  load(): Observable<AccountResponse> {
    return from(this.api.invoke(getAccount, {})).pipe(tap((account) => this.remember(account)));
  }

  setUsername(username: string): Observable<AccountResponse> {
    return from(this.api.invoke(setUsername, { body: { username } })).pipe(
      tap((account) => this.remember(account)),
    );
  }

  private remember(account: AccountResponse): void {
    this.account.set(account);
    this.username.set(account.username ?? null);
  }
}
