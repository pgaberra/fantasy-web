import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { UnverifiedBannerComponent } from './unverified-banner';

/**
 * The nudge to verify an address, downloaded only for a signed-in account that has not: everyone
 * else, signed out or verified, never pays for it in the bundle loaded first.
 */
@Component({
  selector: 'app-lazy-unverified-banner',
  imports: [UnverifiedBannerComponent],
  template: `
    @defer (when auth.isLoggedIn() && !auth.isEmailVerified()) {
      <app-unverified-banner />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LazyUnverifiedBannerComponent {
  protected readonly auth = inject(AuthService);
}
