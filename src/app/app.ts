import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  protected readonly environmentName = environment.environmentName;
  protected readonly appVersion = environment.version;
}
