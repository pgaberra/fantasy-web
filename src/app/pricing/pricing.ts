import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-pricing',
  imports: [RouterLink],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class PricingComponent {
  private readonly billing = inject(BillingService);
  private readonly notifications = inject(NotificationService);
  protected readonly authService = inject(AuthService);
  protected readonly starting = signal(false);

  subscribe(): void {
    this.starting.set(true);
    this.billing.startCheckout().subscribe({
      next: (response) => {
        window.location.href = response.checkoutUrl;
      },
      error: () => {
        this.starting.set(false);
        this.notifications.error('Could not start checkout. Please try again.');
      },
    });
  }
}
