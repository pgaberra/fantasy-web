import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from './services/auth.service';
import { ConsentBannerComponent } from './shared/consent-banner/consent-banner';
import { EnvironmentBannerComponent } from './shared/environment-banner/environment-banner';
import { ToastComponent } from './shared/toast/toast';
import { UnverifiedBannerComponent } from './shared/unverified-banner/unverified-banner';
import { environment } from '../environments/environment';

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
    ToastComponent,
    UnverifiedBannerComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly environmentName = environment.environmentName;
  protected readonly appVersion = environment.version;
  protected readonly paymentsEnabled = environment.paymentsEnabled;

  private readonly currentPath = () => this.router.url.split(/[?#]/)[0];
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.currentPath()),
    ),
    { initialValue: this.currentPath() },
  );

  protected readonly isLandingRoute = computed(() => this.path() === '/');

  // The Draft menu covers both the draft-source picker and the projections behind it, so it
  // stays highlighted anywhere under either — a trigger button gets no routerLinkActive.
  protected readonly isDraftSection = computed(
    () => this.path().startsWith('/draft') || this.path().startsWith('/projections'),
  );
}
