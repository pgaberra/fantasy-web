import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, from, map, of } from 'rxjs';
import { Api } from '../api/api';
import { getFeatures } from '../api/fn/features/get-features';

// The BFF decides whether the streamer planner is served (STREAMER_PLANNER_ENABLED) and answers
// 404 on its endpoints when it is not, so a typed or bookmarked /streamer-planner is sent home
// rather than shown a page whose every request fails. Asked here rather than read off
// FeatureService, whose answer may not have landed yet on a first navigation. A failed read sends
// home too: the page could not load against that BFF either.
export const streamerPlannerEnabledGuard: CanActivateFn = () => {
  const router = inject(Router);
  return from(inject(Api).invoke(getFeatures)).pipe(
    map((features) => (features.streamerPlanner ? true : router.createUrlTree(['/']))),
    catchError(() => of(router.createUrlTree(['/']))),
  );
};
