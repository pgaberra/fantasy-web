import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { initializePaddle, type Environments } from '@paddle/paddle-js';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';
import { NotificationService } from '../services/notification.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-pricing',
  imports: [RouterLink],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class PricingComponent implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly notifications = inject(NotificationService);
  protected readonly authService = inject(AuthService);
  protected readonly starting = signal(false);

  /**
   * What this visitor would actually be charged, already formatted by Paddle in their own
   * currency. Null while it loads, and if it cannot be fetched.
   *
   * Asked of Paddle rather than written into the template because the catalog carries a base
   * price in USD and a local price per country. A number typed in here would be right for one
   * country and wrong for the rest, and a page quoting one figure while checkout charges
   * another is how a sale gets abandoned. The cost is that this page, and not only the
   * checkout, loads Paddle's script, so Paddle sees the IP of anyone who opens it. The privacy
   * policy says so.
   */
  protected readonly formattedPrice = signal<string | null>(null);

  ngOnInit(): void {
    const priceId = environment.paddlePriceId;
    if (!environment.paddleClientToken || !priceId) {
      return;
    }

    initializePaddle({
      token: environment.paddleClientToken,
      environment: environment.paddleEnvironment as Environments,
    })
      .then((paddle) => paddle?.PricePreview({ items: [{ priceId, quantity: 1 }] }))
      .then((preview) => {
        const lineItem = preview?.data.details.lineItems[0];
        if (lineItem) {
          this.formattedPrice.set(lineItem.formattedTotals.total);
        }
      })
      // Deliberately quiet. A price we could not fetch is a smaller problem than an error
      // toast on a marketing page, and the card still reads correctly without it.
      .catch(() => this.formattedPrice.set(null));
  }

  subscribe(): void {
    this.starting.set(true);
    this.billing.startCheckout().subscribe({
      next: (response) => {
        window.location.href = response.checkoutUrl;
      },
      error: () => {
        this.starting.set(false);
        // No "please try again". The BFF answers 502 here, and it does so for faults on our
        // side: a misconfigured payment provider, a key that stopped working. Retrying that
        // never helps, and at a payment step the thing worth saying is that no money moved.
        this.notifications.error(
          'Checkout could not be started. Nothing has been charged, and we have been notified.',
        );
      },
    });
  }
}
