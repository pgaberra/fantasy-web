import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const landingRedirectGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (!authService.isLoggedIn()) {
    return true;
  }
  // After the Yahoo callback the browser lands back here with ?yahoo=connected or
  // ?yahoo=error&reason=…; send admins back to the admin panel (where they started the connect)
  // instead of projections. A failed connect used to fall through to projections and say
  // nothing at all, which is how a dead connection sat unnoticed for two months.
  // Params are typed `any` by the router; narrow once here rather than at every use.
  const params = route.queryParams as Record<string, string | undefined>;
  const outcome = params['yahoo'];
  if ((outcome === 'connected' || outcome === 'error') && authService.isAdmin()) {
    // Everything the callback sent, not a hand-picked subset: listing the params here once cost
    // us Yahoo's own error code, which was the one thing worth carrying.
    return router.createUrlTree(['/admin'], { queryParams: { ...params } });
  }
  return router.createUrlTree(['/projections']);
};
