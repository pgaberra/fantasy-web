import { Routes } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection/draft-projection';
import { ProjectionListComponent } from './projection-list/projection-list';
import { ProjectionCreateComponent } from './projection-create/projection-create';
import { DraftModeComponent } from './draft-mode/draft-mode';
import { WhosHotComponent } from './whos-hot/whos-hot';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password';
import { ResetPasswordComponent } from './auth/reset-password/reset-password';
import { VerifyEmailComponent } from './auth/verify-email/verify-email';
import { GoogleCallbackComponent } from './auth/google-callback/google-callback';
import { LandingComponent } from './landing/landing';
import { SharedProjectionComponent } from './shared-projection/shared-projection';
import { AdminComponent } from './admin/admin';
import { PrivacyComponent } from './privacy/privacy';
import { PricingComponent } from './pricing/pricing';
import { AccountComponent } from './account/account';
import { landingRedirectGuard } from './guards/landing-redirect.guard';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { paymentsEnabledGuard } from './guards/payments-enabled.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent, canActivate: [landingRedirectGuard] },
  { path: 'projections', component: ProjectionListComponent },
  { path: 'projections/new', component: ProjectionCreateComponent },
  { path: 'projections/:id/draft', component: DraftModeComponent },
  { path: 'projections/:id', component: DraftProjectionComponent },
  // Public and unguarded on purpose: a share link has to open for someone who has never signed
  // in — that is the whole point of it. nginx serves crawlers an Open Graph document for this
  // path instead, so a posted link unfurls as the projection rather than the site.
  { path: 's/:token', component: SharedProjectionComponent },
  { path: 'whos-hot', component: WhosHotComponent },
  { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
  // Public and unguarded on purpose: consent has to be informed, so the policy must be
  // reachable from the banner before anyone has agreed to anything.
  { path: 'privacy', component: PrivacyComponent },
  // Payments UI stays dark until the PAYMENTS_ENABLED build flag is on — the guard redirects both
  // routes home otherwise. Account additionally requires being signed in.
  { path: 'pricing', component: PricingComponent, canActivate: [paymentsEnabledGuard] },
  { path: 'account', component: AccountComponent, canActivate: [paymentsEnabledGuard, authGuard] },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'auth/google/callback', component: GoogleCallbackComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'verify-email', component: VerifyEmailComponent },
];
