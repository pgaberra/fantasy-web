import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, from, map, of } from 'rxjs';
import { Api } from '../api/api';
import { getFeatures } from '../api/fn/features/get-features';

// The BFF decides whether Draft Analysis is served (DRAFT_ANALYSIS_ENABLED) and answers 404 on its
// endpoint when it is not, so a typed or bookmarked /draft-analysis is sent home rather than shown
// a page whose every request fails. Asked here rather than read off FeatureService, whose answer
// may not have landed yet on a first navigation. A failed read sends home too.
export const draftAnalysisEnabledGuard: CanActivateFn = () => {
  const router = inject(Router);
  return from(inject(Api).invoke(getFeatures)).pipe(
    map((features) => (features.draftAnalysis ? true : router.createUrlTree(['/']))),
    catchError(() => of(router.createUrlTree(['/']))),
  );
};
