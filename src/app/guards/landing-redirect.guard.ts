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
    const reason = params['reason'];
    return router.createUrlTree(['/admin'], {
      queryParams: reason ? { yahoo: outcome, reason } : { yahoo: outcome },
    });
  }
  return router.createUrlTree(['/projections']);
};
