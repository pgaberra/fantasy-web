import { Routes } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection/draft-projection';
import { ProjectionListComponent } from './projection-list/projection-list';
import { ProjectionCreateComponent } from './projection-create/projection-create';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password';
import { ResetPasswordComponent } from './auth/reset-password/reset-password';
import { LandingComponent } from './landing/landing';
import { AdminComponent } from './admin/admin';
import { landingRedirectGuard } from './guards/landing-redirect.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent, canActivate: [landingRedirectGuard] },
  { path: 'projections', component: ProjectionListComponent },
  { path: 'projections/new', component: ProjectionCreateComponent },
  { path: 'projections/:id', component: DraftProjectionComponent },
  { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
];
