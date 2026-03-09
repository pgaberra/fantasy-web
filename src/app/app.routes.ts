import { Routes } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection/draft-projection';

export const routes: Routes = [
  { path: '', redirectTo: 'draft-projection', pathMatch: 'full' },
  { path: 'draft-projection', component: DraftProjectionComponent },
];
