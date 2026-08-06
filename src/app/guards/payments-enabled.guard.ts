import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';

// Keeps the whole payments feature dark when the build flag is off: even a direct navigation to
// /pricing or /account redirects home, so nothing payment-related is reachable until launch.
export const paymentsEnabledGuard: CanActivateFn = () => {
  const router = inject(Router);
  return environment.paymentsEnabled ? true : router.createUrlTree(['/']);
};
