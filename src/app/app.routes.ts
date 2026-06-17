import { Routes } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection/draft-projection';
import { ProjectionListComponent } from './projection-list/projection-list';
import { ProjectionCreateComponent } from './projection-create/projection-create';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';
import { LandingComponent } from './landing/landing';
import { landingRedirectGuard } from './guards/landing-redirect.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent, canActivate: [landingRedirectGuard] },
  { path: 'projections', component: ProjectionListComponent },
  { path: 'projections/new', component: ProjectionCreateComponent },
  { path: 'projections/:id', component: DraftProjectionComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
];
