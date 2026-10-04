import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, from, map, of } from 'rxjs';
import { Api } from '../api/api';
import { getFeatures } from '../api/fn/features/get-features';

// The BFF decides whether the FA scout is served (FA_SCOUT_ENABLED and the AI projection) and
// answers 404 on its endpoint when it is not, so a typed or bookmarked /fa-scout is sent home
// rather than shown a page whose every request fails. Asked here rather than read off
// FeatureService, whose answer may not have landed yet on a first navigation.
export const faScoutEnabledGuard: CanActivateFn = () => {
  const router = inject(Router);
  return from(inject(Api).invoke(getFeatures)).pipe(
    map((features) => (features.faScout ? true : router.createUrlTree(['/']))),
    catchError(() => of(router.createUrlTree(['/']))),
  );
};
