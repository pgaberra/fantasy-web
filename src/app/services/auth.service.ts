import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { from, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Api } from '../api/api';
import { login } from '../api/fn/authentication/login';
import { register } from '../api/fn/authentication/register';
import { refresh } from '../api/fn/authentication/refresh';
import { googleLogin } from '../api/fn/authentication/google-login';
import { forgotPassword } from '../api/fn/authentication/forgot-password';
import { resetPassword } from '../api/fn/authentication/reset-password';
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
      tap((response) => this.storeTokens(response)),
    );
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return from(this.api.invoke(register, { body: request })).pipe(
      tap((response) => this.storeTokens(response)),
    );
  }

  googleLogin(idToken: string): Observable<AuthResponse> {
    return from(this.api.invoke(googleLogin, { body: { idToken } })).pipe(
      tap((response) => this.storeTokens(response)),
    );
  }

  refresh(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    const body: RefreshRequest = { refreshToken: refreshToken ?? '' };
    return from(this.api.invoke(refresh, { body })).pipe(
      tap((response) => this.storeTokens(response)),
    );
  }

  forgotPassword(email: string): Observable<void> {
    return from(this.api.invoke(forgotPassword, { body: { email } }));
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return from(this.api.invoke(resetPassword, { body: { token, newPassword } }));
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
    void this.router.navigate(['/projections']);
  }
}
