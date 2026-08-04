import { Routes } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection/draft-projection';
import { ProjectionListComponent } from './projection-list/projection-list';
import { ProjectionCreateComponent } from './projection-create/projection-create';
import { DraftModeComponent } from './draft-mode/draft-mode';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password';
import { ResetPasswordComponent } from './auth/reset-password/reset-password';
import { VerifyEmailComponent } from './auth/verify-email/verify-email';
import { GoogleCallbackComponent } from './auth/google-callback/google-callback';
import { LandingComponent } from './landing/landing';
import { AdminComponent } from './admin/admin';
import { PrivacyComponent } from './privacy/privacy';
import { landingRedirectGuard } from './guards/landing-redirect.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent, canActivate: [landingRedirectGuard] },
  { path: 'projections', component: ProjectionListComponent },
  { path: 'projections/new', component: ProjectionCreateComponent },
  { path: 'projections/:id/draft', component: DraftModeComponent },
  { path: 'projections/:id', component: DraftProjectionComponent },
  { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
  // Public and unguarded on purpose: consent has to be informed, so the policy must be
  // reachable from the banner before anyone has agreed to anything.
  { path: 'privacy', component: PrivacyComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'auth/google/callback', component: GoogleCallbackComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'verify-email', component: VerifyEmailComponent },
];
