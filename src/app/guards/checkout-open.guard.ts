import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';

// While Premium is announced but not yet sold, a direct visit to the checkout page lands on the
// Premium page, which says so, rather than opening a checkout nobody was offered.
export const checkoutOpenGuard: CanActivateFn = () => {
  const router = inject(Router);
  return environment.premiumComingSoon ? router.createUrlTree(['/premium']) : true;
};
