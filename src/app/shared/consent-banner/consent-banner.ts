import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../../services/analytics.service';

/**
 * Cookie consent for analytics. Renders only while the decision is genuinely pending —
 * `consentDecision()` is null when analytics is disabled (no PostHog key) or still loading,
 * so local dev never shows a banner for a system that isn't running.
 */
@Component({
  selector: 'app-consent-banner',
  imports: [RouterLink],
  templateUrl: './consent-banner.html',
  styleUrl: './consent-banner.css',
})
export class ConsentBannerComponent {
  private readonly analytics = inject(AnalyticsService);

  readonly isPending = () => this.analytics.consentDecision() === 'pending';

  accept() {
    this.analytics.optIn();
  }

  decline() {
    this.analytics.optOut();
  }
}
