import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EntitlementService } from '../services/entitlement.service';

// UX-only gate for premium-only routes: it keeps non-premium users out of a premium page and
// sends them to pricing. It is NOT a security boundary — the BFF must enforce entitlement on any
// real premium endpoint. (No route uses this yet; it ships ready for the first premium feature.)
export const premiumGuard: CanActivateFn = () => {
  const entitlement = inject(EntitlementService);
  const router = inject(Router);
  return entitlement.premium() ? true : router.createUrlTree(['/pricing']);
};
