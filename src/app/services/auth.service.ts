import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { from, Observable, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Api } from '../api/api';
import { login } from '../api/fn/authentication/login';
import { register } from '../api/fn/authentication/register';
import { refresh } from '../api/fn/authentication/refresh';
import { googleCodeLogin } from '../api/fn/authentication/google-code-login';
import { facebookLogin } from '../api/fn/authentication/facebook-login';
import { forgotPassword } from '../api/fn/authentication/forgot-password';
import { resetPassword } from '../api/fn/authentication/reset-password';
import { verifyEmail } from '../api/fn/authentication/verify-email';
import { resendVerification } from '../api/fn/authentication/resend-verification';
import { AuthResponse, LoginRequest, RefreshRequest, RegisterRequest } from '../api/models';
import { AnalyticsService } from './analytics.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);

  private readonly tokenKey = 'auth_token';
  private readonly refreshTokenKey = 'refresh_token';
  private readonly adminKey = 'is_admin';
  private readonly emailVerifiedKey = 'email_verified';
  private readonly googleStateKey = 'google_oauth_state';
  private readonly googleCallbackPath = '/auth/google/callback';
  private readonly googleAuthEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';

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
      tap((response) => {
        this.storeTokens(response);
        this.analytics.capture('user_registered');
      }),
    );
  }

  /**
   * Starts "Continue with Google" as a top-level redirect to Google's OAuth authorization
   * endpoint. Unlike Google's embedded button (a third-party script/iframe that iOS Safari's
   * tracking prevention silently blocks), a top-level navigation always works. A random `state`
   * persisted to sessionStorage guards the round-trip against CSRF.
   */
  startGoogleRedirect(): void {
    const state = crypto.randomUUID();
    sessionStorage.setItem(this.googleStateKey, state);
    window.location.assign(this.buildGoogleAuthUrl(state));
  }

  buildGoogleAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: environment.googleClientId,
      redirect_uri: this.googleRedirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `${this.googleAuthEndpoint}?${params.toString()}`;
  }

  /**
   * Completes the redirect: validates the returned `state` against the one we stored, then has
   * the BFF exchange the authorization code for our token pair (the confidential code exchange
   * happens server-side). A missing or mismatched state fails closed.
   */
  completeGoogleLogin(code: string, state: string): Observable<AuthResponse> {
    const expectedState = sessionStorage.getItem(this.googleStateKey);
    sessionStorage.removeItem(this.googleStateKey);
    if (!expectedState || expectedState !== state) {
      return throwError(() => new Error('Google sign-in could not be verified. Please try again.'));
    }
    return from(
      this.api.invoke(googleCodeLogin, { body: { code, redirectUri: this.googleRedirectUri() } }),
    ).pipe(tap((response) => this.storeTokens(response)));
  }

  private googleRedirectUri(): string {
    return `${window.location.origin}${this.googleCallbackPath}`;
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
    // Without this the next person to sign in on this browser inherits the previous identity.
    this.analytics.reset();
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
    const email = this.decodeClaims()?.email;
    return typeof email === 'string' ? email : null;
  }

  /**
   * The signed-in user's account UUID, read from the JWT's `sub` claim (null if
   * absent/undecodable). This is the identifier analytics uses — the `email` claim lives in
   * the same payload and must never be used in its place.
   */
  getUserId(): string | null {
    const subject = this.decodeClaims()?.sub;
    return typeof subject === 'string' ? subject : null;
  }

  private decodeClaims(): { sub?: string; email?: string } | null {
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
      return JSON.parse(atob(padded)) as { sub?: string; email?: string };
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
    // Also runs on a silent token refresh, which is harmless: PostHog ignores a repeated
    // identify with an unchanged distinct id.
    const userId = this.getUserId();
    if (userId) {
      this.analytics.identify(userId);
    }
    void this.router.navigate(['/projections']);
  }
}
