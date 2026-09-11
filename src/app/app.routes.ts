import { RedirectFunction, Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { landingRedirectGuard } from './guards/landing-redirect.guard';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { paymentsEnabledGuard } from './guards/payments-enabled.guard';
import { whosHotEnabledGuard } from './guards/whos-hot-enabled.guard';
import { INDEXABLE } from './shared/crawl-tags';

/**
 * The old payment addresses, /pricing and /account, both land on /premium with whatever they were
 * carrying. Built rather than written as a plain string because the query string has to come with
 * it explicitly: ?checkout=success is what tells the page it is the welcome after a payment, and a
 * redirect that dropped it would greet a new subscriber as a visitor.
 */
const toPremium: RedirectFunction = (route) =>
  inject(Router).createUrlTree(['/premium'], { queryParams: route.queryParams });

/**
 * Every route is loaded on demand. Statically importing the components put each feature —
 * the projections table, the draft board, Who's hot, the shared page — into the initial
 * bundle, which was closing in on the 1 MB `maximumError` budget in `angular.json`. The
 * guards stay eagerly imported: they are tiny and have to run before the chunk is fetched.
 *
 * `data: { [INDEXABLE]: true }` is what lets search engines list a page; every route without it
 * is marked noindex (see shared/crawl-tags.ts), and public/sitemap.xml has to list exactly the
 * ones with it.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./landing/landing').then((m) => m.LandingComponent),
    canActivate: [landingRedirectGuard],
    data: { [INDEXABLE]: true },
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
    data: { [INDEXABLE]: true },
  },
  // Public and unguarded like /privacy, and deliberately not behind the payments flag: Paddle's
  // website review reads the terms from a signed-out browser before the feature is ever switched
  // on, and a customer deciding whether to pay has to be able to read them before they do.
  {
    path: 'terms',
    loadComponent: () => import('./terms/terms').then((m) => m.TermsComponent),
    data: { [INDEXABLE]: true },
  },
  // Payments UI stays dark until the PAYMENTS_ENABLED build flag is on — the guard redirects
  // these routes home otherwise.
  //
  // One page for the plans and for the subscription on them, so /pricing and /account are kept
  // only as the way here: a checkout Paddle has already redirected, a bookmark, a link posted
  // somewhere we cannot edit. The redirect carries the query string, since ?checkout=success is
  // what tells the page it is the welcome.
  {
    path: 'premium',
    loadComponent: () => import('./premium/premium').then((m) => m.PremiumComponent),
    canActivate: [paymentsEnabledGuard],
  },
  {
    path: 'pricing',
    pathMatch: 'full',
    redirectTo: toPremium,
  },
  {
    path: 'account',
    pathMatch: 'full',
    redirectTo: toPremium,
  },
  // Where Paddle's checkout opens. Behind the payments flag like the rest, but deliberately
  // not behind authGuard: a session that lapsed between starting checkout and landing here
  // would be redirected to /login, which drops the transaction id in the URL and strands a
  // checkout Paddle has already prepared.
  {
    path: 'pay',
    loadComponent: () => import('./pay/pay').then((m) => m.PayComponent),
    canActivate: [paymentsEnabledGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then((m) => m.LoginComponent),
    data: { [INDEXABLE]: true },
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register/register').then((m) => m.RegisterComponent),
    data: { [INDEXABLE]: true },
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
  // Last, and matching everything left. Without it the router threw NG04002 on any address
  // the app does not have — a mistyped URL, a link to a page that has since been renamed, a
  // crawler guessing — which reported to Sentry as an application error and left the visitor
  // with the header above nothing at all.
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFoundComponent),
  },
];
