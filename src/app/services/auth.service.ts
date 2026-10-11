import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { defer, firstValueFrom, from, Observable, throwError } from 'rxjs';
import { finalize, shareReplay, tap } from 'rxjs/operators';
import { Api } from '../api/api';
import { login } from '../api/fn/authentication/login';
import { register } from '../api/fn/authentication/register';
import { refresh } from '../api/fn/authentication/refresh';
import { logout as logoutRequest } from '../api/fn/authentication/logout';
import { googleCodeLogin } from '../api/fn/authentication/google-code-login';
import { facebookLogin } from '../api/fn/authentication/facebook-login';
import { forgotPassword } from '../api/fn/authentication/forgot-password';
import { resetPassword } from '../api/fn/authentication/reset-password';
import { verifyEmail } from '../api/fn/authentication/verify-email';
import { resendVerification } from '../api/fn/authentication/resend-verification';
import { signOutEverywhere } from '../api/fn/account/sign-out-everywhere';
import { AuthResponse, LoginRequest, RegisterRequest } from '../api/models';
import { AnalyticsService } from './analytics.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);

  /**
   * The browser's storage, or none while a page is prerendered at build time, where there is no
   * visitor and so no session: every read then answers "signed out".
   */
  private readonly storage: Storage | null = isPlatformBrowser(inject(PLATFORM_ID))
    ? localStorage
    : null;
  private readonly session: Storage | null = isPlatformBrowser(inject(PLATFORM_ID))
    ? sessionStorage
    : null;

  private readonly tokenKey = 'auth_token';
  /**
   * Where the refresh token used to be kept. It lives in an HttpOnly cookie the BFF sets now, out
   * of reach of script and of Safari's seven-day cap on script-writable storage; this key is only
   * read to carry a session from before that move across once, and is then removed.
   */
  private readonly legacyRefreshTokenKey = 'refresh_token';
  private readonly adminKey = 'is_admin';
  private readonly emailVerifiedKey = 'email_verified';
  private readonly googleStateKey = 'google_oauth_state';
  private readonly returnUrlKey = 'auth_return_url';
  private readonly googleCallbackPath = '/auth/google/callback';
  private readonly googleAuthEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
  private refreshInFlight: Observable<AuthResponse> | null = null;
  private sessionRestore: Promise<void> | null = null;

  readonly isLoggedIn = signal<boolean>(!!this.storage?.getItem(this.tokenKey));
  readonly isAdmin = signal<boolean>(this.storage?.getItem(this.adminKey) === 'true');
  // Absent means "unknown" — treat as verified so we never nag a session predating this flag;
  // the real value lands on the next login/refresh. Only an explicit 'false' shows the banner.
  readonly isEmailVerified = signal<boolean>(
    this.storage?.getItem(this.emailVerifiedKey) !== 'false',
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
    this.session?.setItem(this.googleStateKey, state);
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
    const expectedState = this.session?.getItem(this.googleStateKey) ?? null;
    this.session?.removeItem(this.googleStateKey);
    if (!expectedState || expectedState !== state) {
      return throwError(() => new Error('Google sign-in could not be verified.'));
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

  /**
   * One refresh at a time. A page that fires several calls just after the access token expires
   * gets a 401 on each, and each used to start its own refresh; every extra POST was one more
   * chance to fail on a blip, and a BFF that ever rotates refresh tokens would reject all but the
   * first. Callers that arrive while one is in flight share its answer.
   */
  refresh(): Observable<AuthResponse> {
    this.refreshInFlight ??= defer(() => {
      // The refresh token travels as the HttpOnly cookie (the interceptor sends auth calls with
      // credentials). A session from before the cookie still has its token in localStorage, and
      // sends it here until a refresh succeeds and the cookie takes over.
      const legacyToken = this.legacyRefreshToken();
      return legacyToken
        ? this.api.invoke(refresh, { body: { refreshToken: legacyToken } })
        : this.api.invoke(refresh);
    }).pipe(
      // Stored but not followed by a navigation: a refresh happens silently behind whatever the
      // user is reading, and sending them to /home for it would yank the page away.
      tap((response) => this.storeTokens(response, { thenNavigate: false })),
      finalize(() => (this.refreshInFlight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshInFlight;
  }

  /**
   * The one attempt per page load to pick a session back up from the refresh cookie, for a
   * browser that holds no access token. Safari deletes localStorage after seven days of use
   * without a visit, so a weekly visitor arrives with nothing stored but the cookie the BFF set,
   * and reading "no token" as "signed out" sent them to the form every time.
   *
   * <p>The guards wait for this before deciding, rather than the whole app bootstrap. It never
   * rejects: a refused refresh (401/403) is simply a visitor who is not signed in, and a failed
   * one (no connection, a 5xx) reads as signed out for this page load while leaving everything
   * stored as it was. Neither navigates or shows anything, so an anonymous visitor sees the
   * landing page exactly as before. A server that never answers is waited on for
   * `RESTORE_WAIT_MS` at most; the refresh carries on behind the page and still signs the
   * visitor in if it lands. Nothing to do while prerendering, where there is no visitor.
   */
  restoreSession(): Promise<void> {
    this.sessionRestore ??= this.attemptRestore();
    return this.sessionRestore;
  }

  private attemptRestore(): Promise<void> {
    if (!this.storage || this.getToken()) {
      return Promise.resolve();
    }
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const attempt = firstValueFrom(this.refresh()).then(
      () => undefined,
      (error: unknown) => {
        // A token the server refused will be refused on every load after this one too.
        if (refreshRefused(error)) {
          this.storage?.removeItem(this.legacyRefreshTokenKey);
        }
      },
    );
    const timeLimit = new Promise<void>((resolve) => {
      giveUp = setTimeout(resolve, RESTORE_WAIT_MS);
    });
    return Promise.race([attempt, timeLimit]).finally(() => clearTimeout(giveUp));
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
        this.storage?.setItem(this.emailVerifiedKey, 'true');
        this.isEmailVerified.set(true);
      }),
    );
  }

  resendVerification(email: string): Observable<void> {
    return from(this.api.invoke(resendVerification, { body: { email } }));
  }

  /**
   * Signing out on purpose: the form is where they meant to end up, and nothing follows them.
   *
   * <p>Only this browser. The refresh token stays valid on the server, because the one way to
   * revoke it ends every session the account has, and signing out of a laptop should not also
   * sign someone out of their phone. {@link signOutEverywhere} is that choice, made deliberately.
   *
   * <p>The BFF is asked to clear the refresh cookie, which script cannot touch; left in place, the
   * next page load would quietly sign this browser back in.
   */
  logout() {
    this.api.invoke(logoutRequest).catch(() => {
      // Deliberately unreported: signing out here goes ahead regardless, and there is nothing the
      // visitor could do about a failed clear. The cookie then outlives this sign-out until it
      // expires or a later sign-out reaches the server.
    });
    this.endSession();
    void this.router.navigate(['/login']);
  }

  /**
   * Revokes every session the account holds, this one included, then signs out here. Other
   * devices keep their access token until it expires (15 minutes) and are signed out at the
   * refresh after it. When the request fails nothing was revoked, so this session is left alone
   * for the caller to report.
   */
  signOutEverywhere(): Observable<void> {
    return from(this.api.invoke(signOutEverywhere, {})).pipe(tap(() => this.logout()));
  }

  /**
   * A session that ran out underneath whatever the visitor was reading, which is a different
   * thing from deciding to leave: they were in the middle of something, and the page they lost
   * is the page they want back. It rides to the form as `returnUrl`, the same way a guard's
   * bounce and a share link's prompt send someone there.
   *
   * <p>Except from a form itself, where coming back to it would be a loop rather than a return.
   */
  endExpiredSession(): void {
    this.endSession();
    const lost = this.router.url;
    void (isAuthPage(lost)
      ? this.router.navigate(['/login'])
      : this.router.navigate(['/login'], { queryParams: { returnUrl: lost } }));
  }

  private endSession(): void {
    this.storage?.removeItem(this.tokenKey);
    this.storage?.removeItem(this.legacyRefreshTokenKey);
    this.storage?.removeItem(this.adminKey);
    this.storage?.removeItem(this.emailVerifiedKey);
    this.isLoggedIn.set(false);
    this.isAdmin.set(false);
    this.isEmailVerified.set(true);
    // Without this the next person to sign in on this browser inherits the previous identity.
    this.analytics.reset();
  }

  getToken(): string | null {
    return this.storage?.getItem(this.tokenKey) ?? null;
  }

  private legacyRefreshToken(): string | null {
    return this.storage?.getItem(this.legacyRefreshTokenKey) ?? null;
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

  /**
   * Where to land once signed in, for a visitor who was sent to the form from a page that wants
   * them back — a share link they have to sign in to read in full, say.
   *
   * <p>Held in sessionStorage rather than carried through the form, so it survives the hop out to
   * Google and back. Anything that is not a path on this site is dropped: the value arrives in a
   * query parameter, and a link could otherwise point the redirect at another origin.
   *
   * <p>Arriving at a form without one clears whatever was there. It used to be left in place, on
   * the reasoning that a visitor switching between Sign in and Register should not lose where
   * they were headed. That is true, and the two forms now carry the parameter across to each
   * other so it holds without this. What was left over was worse: reaching the form from the nav
   * an hour later, or from a guard, sent them to a page they had asked for in another life. Now
   * that a return URL can carry an action, it would also take a copy of a board they had thought
   * better of.
   */
  rememberReturnUrl(url: string | null | undefined): void {
    if (url && isInternalPath(url)) {
      this.session?.setItem(this.returnUrlKey, url);
      return;
    }
    this.session?.removeItem(this.returnUrlKey);
  }

  private takeReturnUrl(): string | null {
    const url = this.session?.getItem(this.returnUrlKey) ?? null;
    this.session?.removeItem(this.returnUrlKey);
    return url && isInternalPath(url) ? url : null;
  }

  private storeTokens(response: AuthResponse, options = { thenNavigate: true }) {
    this.storage?.setItem(this.tokenKey, response.token);
    // The cookie that came with this response is the refresh token from here on.
    this.storage?.removeItem(this.legacyRefreshTokenKey);
    this.storage?.setItem(this.adminKey, String(response.admin));
    this.storage?.setItem(this.emailVerifiedKey, String(response.emailVerified));
    this.isLoggedIn.set(true);
    this.isAdmin.set(response.admin);
    this.isEmailVerified.set(response.emailVerified);
    // Also runs on a silent token refresh, which is harmless: PostHog ignores a repeated
    // identify with an unchanged distinct id.
    const userId = this.getUserId();
    if (userId) {
      this.analytics.identify(userId);
    }
    if (options.thenNavigate) {
      void this.router.navigateByUrl(this.takeReturnUrl() ?? '/home');
    }
  }
}

/**
 * How long the guards wait on `AuthService.restoreSession` before treating the visitor as signed
 * out. A refresh normally answers in well under a second; a hung server (staging's BFF deadlocked
 * on 2026-09-11) would otherwise hold every first page, the landing page included, until the 60 s
 * write timeout.
 */
const RESTORE_WAIT_MS = 5000;

/** The refresh endpoint's own refusal: the refresh token, cookie or legacy, is no good. */
function refreshRefused(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    (error.status === HttpStatusCode.Unauthorized || error.status === HttpStatusCode.Forbidden)
  );
}

/** The forms and the pages that only exist to get someone to one. */
const AUTH_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth',
];

function isAuthPage(url: string): boolean {
  const path = url.split('?')[0];
  return AUTH_PATHS.some((auth) => path === auth || path.startsWith(`${auth}/`));
}

/**
 * A path on this site, and nothing else. Rejects an absolute URL, and `//evil.example` with it —
 * the browser reads a protocol-relative URL as another origin, and it starts with a slash like
 * any local path does.
 */
function isInternalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
}
