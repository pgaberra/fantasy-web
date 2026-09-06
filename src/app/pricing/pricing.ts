import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { initializePaddle, type Environments } from '@paddle/paddle-js';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';
import { EntitlementService } from '../services/entitlement.service';
import { NotificationService } from '../services/notification.service';
import { freeFeatures, premiumPerks } from '../shared/premium/premium-perks';
import { environment } from '../../environments/environment';

/**
 * The pricing page: the free plan and Premium side by side, what each includes, and the way in.
 *
 * Two cards rather than one on purpose. A lone Premium card that listed "everything in the free
 * app" as its first perk left the reader to guess what the free app was, and so what they would
 * actually be paying for. Beside the free column, Premium's perks read as the difference.
 *
 * The card knows who is looking at it. A subscriber sees that they already have Premium and the
 * way to their subscription, not a Subscribe button that would start a second checkout; a
 * signed-out visitor is sent to sign in, since the checkout is created for the signed-in caller.
 */
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
  protected readonly entitlement = inject(EntitlementService);
  protected readonly starting = signal(false);

  protected readonly perks = premiumPerks();
  protected readonly freeFeatures = freeFeatures();

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
