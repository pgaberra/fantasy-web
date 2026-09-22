import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AccountService } from './services/account.service';
import { AuthService } from './services/auth.service';
import { FeatureService } from './services/feature.service';
import { EntitlementService } from './services/entitlement.service';
import { ConsentBannerComponent } from './shared/consent-banner/consent-banner';
import { EnvironmentBannerComponent } from './shared/environment-banner/environment-banner';
import { PlayerHeadshotComponent } from './shared/player-headshot/player-headshot';
import { SiteFooterComponent } from './shared/site-footer/site-footer';
import { ToastComponent } from './shared/toast/toast';
import { UnverifiedBannerComponent } from './shared/unverified-banner/unverified-banner';
import { environment } from '../environments/environment';
import { IconComponent } from './shared/icon/icon';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    ConsentBannerComponent,
    EnvironmentBannerComponent,
    PlayerHeadshotComponent,
    SiteFooterComponent,
    ToastComponent,
    UnverifiedBannerComponent,
    IconComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly authService = inject(AuthService);
  readonly account = inject(AccountService);
  // Injected here on purpose, and not only where it is read: the service follows the session
  // through an effect of its own, and the root component is what guarantees it exists from the
  // first paint rather than from the first page that happens to ask about the plan.
  readonly entitlement = inject(EntitlementService);
  private readonly router = inject(Router);
  protected readonly environmentName = environment.environmentName;
  protected readonly appVersion = environment.version;
  protected readonly paymentsEnabled = environment.paymentsEnabled;
  protected readonly whosHotEnabled = environment.whosHotEnabled;
  protected readonly features = inject(FeatureService);

  private readonly currentPath = () => this.router.url.split(/[?#]/)[0];
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.currentPath()),
    ),
    { initialValue: this.currentPath() },
  );

  protected readonly isLandingRoute = computed(() => this.path() === '/');

  // The Draft menu covers the draft-source picker, the projections behind it and the power rankings of
  // a league drafted elsewhere, so it stays highlighted anywhere under any of them — a trigger
  // button gets no routerLinkActive.
  protected readonly isDraftSection = computed(
    () =>
      this.path().startsWith('/draft') ||
      this.path().startsWith('/projections') ||
      this.path().startsWith('/team-power-rankings'),
  );

  // Everything behind the avatar: the profile. Premium is in the menu too, but it is also a
  // header link with its own highlight, so marking the avatar for it would light up two places.
  protected readonly isAccountSection = computed(() => this.path() === '/profile');

  // What the avatar falls back to when there is no picture: the first letter of the username,
  // or of the email while the account has not picked one.
  protected readonly displayName = computed(
    () => this.account.username() ?? this.account.email() ?? '',
  );

  /**
   * The plan as the nav may state it. Null until it is known: "Free plan" said of a subscriber
   * whose entitlement has not landed yet is wrong, not merely early, and the header link that
   * sells Premium to a free account would be selling it to someone who already pays. Null too
   * wherever payments are off, since without them there is no plan to have.
   */
  protected readonly plan = computed<'premium' | 'free' | null>(() => {
    if (!this.paymentsEnabled) {
      return null;
    }
    if (this.entitlement.premium()) {
      return 'premium';
    }
    return this.entitlement.loadState() === 'loaded' ? 'free' : null;
  });

  /**
   * Whether the header offers the Premium page. Only where it could be acted on: a subscriber's
   * header says nothing about Premium, and their plan lives in the account menu. A signed-out
   * visitor is offered it too, since they have no entitlement to load and every other route to
   * the price sits behind a session or on the landing page.
   */
  protected readonly showsPremiumLink = computed(
    () => this.paymentsEnabled && (!this.authService.isLoggedIn() || this.plan() === 'free'),
  );
}
