import { Routes } from '@angular/router';
import { landingRedirectGuard } from './guards/landing-redirect.guard';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { paymentsEnabledGuard } from './guards/payments-enabled.guard';
import { whosHotEnabledGuard } from './guards/whos-hot-enabled.guard';

/**
 * Every route is loaded on demand. Statically importing the components put each feature —
 * the projections table, the draft board, Who's hot, the shared page — into the initial
 * bundle, which was closing in on the 1 MB `maximumError` budget in `angular.json`. The
 * guards stay eagerly imported: they are tiny and have to run before the chunk is fetched.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./landing/landing').then((m) => m.LandingComponent),
    canActivate: [landingRedirectGuard],
  },
  // Picking a draft source needs the user's own projections, so there is nothing to render
  // for a signed-out visitor — send them to sign in rather than to a failed load.
  {
    path: 'draft',
    loadComponent: () => import('./draft-start/draft-start').then((m) => m.DraftStartComponent),
    canActivate: [authGuard],
  },
  {
    path: 'projections',
    loadComponent: () =>
      import('./projection-list/projection-list').then((m) => m.ProjectionListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'projections/new',
    loadComponent: () =>
      import('./projection-create/projection-create').then((m) => m.ProjectionCreateComponent),
    canActivate: [authGuard],
  },
  {
    path: 'projections/:id/draft',
    loadComponent: () => import('./draft-mode/draft-mode').then((m) => m.DraftModeComponent),
    canActivate: [authGuard],
  },
  {
    path: 'projections/:id',
    loadComponent: () =>
      import('./draft-projection/draft-projection').then((m) => m.DraftProjectionComponent),
    canActivate: [authGuard],
  },
  // Public and unguarded on purpose: a share link has to open for someone who has never signed
  // in — that is the whole point of it. nginx serves crawlers an Open Graph document for this
  // path instead, so a posted link unfurls as the projection rather than the site.
  {
    path: 's/:token',
    loadComponent: () =>
      import('./shared-projection/shared-projection').then((m) => m.SharedProjectionComponent),
  },
  // Off with WHOS_HOT_ENABLED=false, which drops the nav links and bounces a direct hit home,
  // so the page can be pulled from an environment without pulling it from the build.
  //
  // The splits behind the leaderboard are a signed-in endpoint, so without this a signed-out
  // visitor who typed the URL or kept a bookmark got the page's "couldn't load — check your
  // connection" state over a 401, which blames the network for a sign-in. The nav only offers
  // the link to a signed-in user, so this catches the direct hit rather than a visible link.
  {
    path: 'whos-hot',
    loadComponent: () => import('./whos-hot/whos-hot').then((m) => m.WhosHotComponent),
    canActivate: [whosHotEnabledGuard, authGuard],
  },
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin').then((m) => m.AdminComponent),
    canActivate: [adminGuard],
  },
  // Public and unguarded on purpose: consent has to be informed, so the policy must be
  // reachable from the banner before anyone has agreed to anything.
  {
    path: 'privacy',
    loadComponent: () => import('./privacy/privacy').then((m) => m.PrivacyComponent),
  },
  // Payments UI stays dark until the PAYMENTS_ENABLED build flag is on — the guard redirects both
  // routes home otherwise. Account additionally requires being signed in.
  {
    path: 'pricing',
    loadComponent: () => import('./pricing/pricing').then((m) => m.PricingComponent),
    canActivate: [paymentsEnabledGuard],
  },
  {
    path: 'account',
    loadComponent: () => import('./account/account').then((m) => m.AccountComponent),
    canActivate: [paymentsEnabledGuard, authGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register/register').then((m) => m.RegisterComponent),
  },
  {
    path: 'auth/google/callback',
    loadComponent: () =>
      import('./auth/google-callback/google-callback').then((m) => m.GoogleCallbackComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./auth/forgot-password/forgot-password').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./auth/reset-password/reset-password').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./auth/verify-email/verify-email').then((m) => m.VerifyEmailComponent),
  },
];
