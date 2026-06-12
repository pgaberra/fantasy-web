import { Routes } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection/draft-projection';
import { ProjectionListComponent } from './projection-list/projection-list';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';

export const routes: Routes = [
  { path: '', redirectTo: 'projections', pathMatch: 'full' },
  { path: 'projections', component: ProjectionListComponent },
  { path: 'projections/new', component: DraftProjectionComponent },
  { path: 'projections/:id', component: DraftProjectionComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
];
