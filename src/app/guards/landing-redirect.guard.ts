import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const landingRedirectGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (!authService.isLoggedIn()) {
    return true;
  }
  // After the Yahoo callback the browser lands back here with ?yahoo=connected; send
  // admins back to the admin panel (where they started the connect) instead of projections.
  if (route.queryParams['yahoo'] === 'connected' && authService.isAdmin()) {
    return router.createUrlTree(['/admin']);
  }
  return router.createUrlTree(['/projections']);
};
