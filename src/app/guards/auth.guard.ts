import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Sends signed-out visitors to the login page. The BFF is the real boundary (it 401s an
// unauthenticated request); this just avoids rendering a signed-in-only page for nobody.
//
// The page they were after rides along as `returnUrl`, the same parameter a share link's sign-in
// prompt uses, so signing in finishes the navigation they started rather than dropping them on
// their projections list. A guarded URL is one they typed, bookmarked or followed a link to, and
// it is worth exactly as much as one of ours.
export const authGuard: CanActivateFn = (_route, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isLoggedIn()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
