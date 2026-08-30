import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';

// Hides the whole Who's hot feature when the build flag turns it off: the nav drops its links and
// this sends a direct navigation home, so a bookmarked or typed /whos-hot cannot reach the page
// either. On unless WHOS_HOT_ENABLED=false, since the page ships by default.
export const whosHotEnabledGuard: CanActivateFn = () => {
  const router = inject(Router);
  return environment.whosHotEnabled ? true : router.createUrlTree(['/']);
};
