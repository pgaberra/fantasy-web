import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { from, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Api } from '../api/api';
import { login } from '../api/fn/authentication/login';
import { register } from '../api/fn/authentication/register';
import { refresh } from '../api/fn/authentication/refresh';
import { AuthResponse, LoginRequest, RefreshRequest, RegisterRequest } from '../api/models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  private readonly tokenKey = 'auth_token';
  private readonly refreshTokenKey = 'refresh_token';

  readonly isLoggedIn = signal<boolean>(!!localStorage.getItem(this.tokenKey));

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return from(this.api.invoke(login, { body: credentials })).pipe(
      tap(response => this.storeTokens(response)),
    );
  }

  register(request: RegisterRequest): Observable<void> {
    return from(this.api.invoke(register, { body: request })).pipe(
      tap(() => void this.router.navigate(['/login'])),
    );
  }

  refresh(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    const body: RefreshRequest = { refreshToken: refreshToken ?? '' };
    return from(this.api.invoke(refresh, { body })).pipe(
      tap(response => this.storeTokens(response)),
    );
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    this.isLoggedIn.set(false);
    void this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  private storeTokens(response: AuthResponse) {
    localStorage.setItem(this.tokenKey, response.token);
    localStorage.setItem(this.refreshTokenKey, response.refreshToken);
    this.isLoggedIn.set(true);
    void this.router.navigate(['/draft-projection']);
  }
}
