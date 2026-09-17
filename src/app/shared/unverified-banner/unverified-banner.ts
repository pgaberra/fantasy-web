import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { LoadingIndicatorComponent } from '../loading-indicator/loading-indicator';
import { IconComponent } from '../icon/icon';

@Component({
  selector: 'app-unverified-banner',
  imports: [LoadingIndicatorComponent, IconComponent],
  templateUrl: './unverified-banner.html',
  styleUrl: './unverified-banner.css',
})
export class UnverifiedBannerComponent {
  private readonly authService = inject(AuthService);

  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly isEmailVerified = this.authService.isEmailVerified;

  readonly isSending = signal(false);
  readonly sent = signal(false);
  readonly failed = signal(false);

  async resend() {
    const email = this.authService.getEmail();
    if (!email) {
      this.failed.set(true);
      return;
    }
    this.isSending.set(true);
    this.failed.set(false);
    try {
      await firstValueFrom(this.authService.resendVerification(email));
      this.sent.set(true);
    } catch {
      this.failed.set(true);
    } finally {
      this.isSending.set(false);
    }
  }
}
