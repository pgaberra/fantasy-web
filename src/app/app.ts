import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from './services/auth.service';
import { EnvironmentBannerComponent } from './shared/environment-banner/environment-banner';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, EnvironmentBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly environmentName = environment.environmentName;
  protected readonly appVersion = environment.version;

  private readonly isCurrentlyLanding = () => this.router.url.split(/[?#]/)[0] === '/';
  protected readonly isLandingRoute = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.isCurrentlyLanding()),
    ),
    { initialValue: this.isCurrentlyLanding() },
  );
}
