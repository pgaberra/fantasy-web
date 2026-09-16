import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';
import { AdminService } from '../services/admin.service';
import { AuthService } from '../services/auth.service';
import { YahooService } from '../services/yahoo.service';

const MAX_LINK_CODE_LENGTH = 128;

export const landingRedirectGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  // Params are typed `any` by the router; narrow once here rather than at every use.
  const params = route.queryParams as Record<string, string | undefined>;
  const outcome = params['yahoo'];

  // The Yahoo callback parks the tokens and sends the browser here, with a one-time code in the
  // fragment, to claim them. Only a signed-in claim attaches them, and the BFF attaches them only
  // to the account that started the connect: a consent link sent to someone else must not connect
  // their Yahoo account to the sender's. Either way the code leaves the address bar.
  if (outcome === 'confirm') {
    if (!authService.isLoggedIn()) {
      return router.createUrlTree(['/']);
    }
    const serviceAccount = params['account'] === 'service';
    const adminService = inject(AdminService);
    const yahooService = inject(YahooService);
    const claim = (code: string): Observable<unknown> =>
      serviceAccount ? adminService.completeYahooConnect(code) : yahooService.completeConnect(code);
    return claimYahooLink(route.fragment, serviceAccount && authService.isAdmin(), claim, router);
  }

  if (!authService.isLoggedIn()) {
    return true;
  }
  // After a failed Yahoo callback the browser lands back here with ?yahoo=error&reason=…; send
  // admins back to the admin panel (where they started the connect) instead of projections. A
  // failed connect used to fall through to projections and say nothing at all, which is how a
  // dead connection sat unnoticed for two months.
  if ((outcome === 'connected' || outcome === 'error') && authService.isAdmin()) {
    // Everything the callback sent, not a hand-picked subset: listing the params here once cost
    // us Yahoo's own error code, which was the one thing worth carrying.
    return router.createUrlTree(['/admin'], { queryParams: { ...params } });
  }
  return router.createUrlTree(['/projections']);
};

/** The Yahoo callback's one-time link code, carried in the fragment as `link=<code>`. */
function linkCode(fragment: string | null): string | null {
  const code = new URLSearchParams(fragment ?? '').get('link');
  return code && code.length <= MAX_LINK_CODE_LENGTH ? code : null;
}

/** Why a claim failed, as the slug the admin page explains. */
function claimFailure(err: unknown): string {
  const status = err instanceof HttpErrorResponse ? err.status : 0;
  if (status === 404) {
    return 'link_expired';
  }
  if (status === 409) {
    return 'wrong_account';
  }
  return 'claim_failed';
}

/**
 * A service-account connect goes back to the admin panel, which explains the outcome; a user's
 * own connect goes to projections, as it always has. A non-admin cannot claim a service-account
 * code: the BFF answers 403, which lands as a failed claim.
 */
function claimYahooLink(
  fragment: string | null,
  toAdmin: boolean,
  claim: (code: string) => Observable<unknown>,
  router: Router,
): Observable<UrlTree> {
  const destination = toAdmin ? ['/admin'] : ['/projections'];
  const result = (queryParams: Record<string, string>): UrlTree =>
    router.createUrlTree(destination, { queryParams });
  const code = linkCode(fragment);
  if (!code) {
    return of(result({ yahoo: 'error', reason: 'claim_failed' }));
  }
  return claim(code).pipe(
    map(() => result({ yahoo: 'connected' })),
    catchError((err: unknown) => of(result({ yahoo: 'error', reason: claimFailure(err) }))),
  );
}
