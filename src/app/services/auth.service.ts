import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { from, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Api } from '../api/api';
import { login } from '../api/fn/authentication/login';
import { register } from '../api/fn/authentication/register';
import { refresh } from '../api/fn/authentication/refresh';
import { googleLogin } from '../api/fn/authentication/google-login';
import { facebookLogin } from '../api/fn/authentication/facebook-login';
import { forgotPassword } from '../api/fn/authentication/forgot-password';
import { resetPassword } from '../api/fn/authentication/reset-password';
import { verifyEmail } from '../api/fn/authentication/verify-email';
import { resendVerification } from '../api/fn/authentication/resend-verification';
import { AuthResponse, LoginRequest, RefreshRequest, RegisterRequest } from '../api/models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  private readonly tokenKey = 'auth_token';
  private readonly refreshTokenKey = 'refresh_token';
  private readonly adminKey = 'is_admin';
  private readonly emailVerifiedKey = 'email_verified';

  readonly isLoggedIn = signal<boolean>(!!localStorage.getItem(this.tokenKey));
  readonly isAdmin = signal<boolean>(localStorage.getItem(this.adminKey) === 'true');
  // Absent means "unknown" — treat as verified so we never nag a session predating this flag;
  // the real value lands on the next login/refresh. Only an explicit 'false' shows the banner.
  readonly isEmailVerified = signal<boolean>(
    localStorage.getItem(this.emailVerifiedKey) !== 'false',
  );

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

  facebookLogin(accessToken: string): Observable<AuthResponse> {
    return from(this.api.invoke(facebookLogin, { body: { accessToken } })).pipe(
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

  verifyEmail(token: string): Observable<void> {
    return from(this.api.invoke(verifyEmail, { body: { token } })).pipe(
      tap(() => {
        localStorage.setItem(this.emailVerifiedKey, 'true');
        this.isEmailVerified.set(true);
      }),
    );
  }

  resendVerification(email: string): Observable<void> {
    return from(this.api.invoke(resendVerification, { body: { email } }));
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.adminKey);
    localStorage.removeItem(this.emailVerifiedKey);
    this.isLoggedIn.set(false);
    this.isAdmin.set(false);
    this.isEmailVerified.set(true);
    void this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  /** The signed-in user's email, read from the JWT's `email` claim (null if absent/undecodable). */
  getEmail(): string | null {
    const payload = this.getToken()?.split('.')[1];
    if (!payload) {
      return null;
    }
    try {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        '=',
      );
      const claims = JSON.parse(atob(padded)) as { email?: string };
      return typeof claims.email === 'string' ? claims.email : null;
    } catch {
      return null;
    }
  }

  private storeTokens(response: AuthResponse) {
    localStorage.setItem(this.tokenKey, response.token);
    localStorage.setItem(this.refreshTokenKey, response.refreshToken);
    localStorage.setItem(this.adminKey, String(response.admin));
    localStorage.setItem(this.emailVerifiedKey, String(response.emailVerified));
    this.isLoggedIn.set(true);
    this.isAdmin.set(response.admin);
    this.isEmailVerified.set(response.emailVerified);
    void this.router.navigate(['/projections']);
  }
}
