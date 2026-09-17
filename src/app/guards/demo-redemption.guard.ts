import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PendingProjectionService } from '../services/pending-projection.service';

// A visitor who edited the landing demo and then signed up has work waiting to be saved, and the
// projections list is where it is saved and opened in the editor. Home comes first for everyone
// else, so without this that work would sit in session storage until they wandered onto the list.
export const demoRedemptionGuard: CanActivateFn = () => {
  const pending = inject(PendingProjectionService).peek();
  return pending ? inject(Router).createUrlTree(['/projections']) : true;
};
