import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CheckoutEventNames,
  initializePaddle,
  type Environments,
  type Paddle,
} from '@paddle/paddle-js';
import { environment } from '../../environments/environment';

/**
 * The page Paddle's checkout opens on.
 *
 * Paddle has no fully hosted checkout page for the web, so the URL the BFF hands back after
 * creating a transaction points here, at our own origin, with the transaction id in `_ptxn`.
 * This page's whole job is to load Paddle.js and open their checkout over it.
 *
 * Deliberately not behind `authGuard`, unlike /account. A signed-in user is the only way to
 * arrive here, since the BFF creates the transaction for the authenticated caller. But a
 * session that lapses between starting checkout and landing here would be bounced to /login,
 * which drops the `_ptxn` and strands a transaction Paddle has already prepared. The
 * transaction id is the credential that matters on this page, and it is Paddle's to trust.
 *
 * Nothing here provisions anything. The subscription becomes real when the webhook reaches
 * the BFF; `successUrl` only decides where the browser lands afterwards.
 */
@Component({
  selector: 'app-pay',
  imports: [RouterLink],
  templateUrl: './pay.html',
  styleUrl: './pay.css',
})
export class PayComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  protected readonly failed = signal(false);

  ngOnInit(): void {
    const transactionId = this.route.snapshot.queryParamMap.get('_ptxn');
    if (!transactionId || !environment.paddleClientToken) {
      this.failed.set(true);
      return;
    }

    initializePaddle({
      token: environment.paddleClientToken,
      environment: environment.paddleEnvironment as Environments,
      eventCallback: (event) => {
        if (event.name === CheckoutEventNames.CHECKOUT_ERROR) {
          this.failed.set(true);
        }
      },
    })
      .then((paddle: Paddle | undefined) => {
        if (!paddle) {
          this.failed.set(true);
          return;
        }
        paddle.Checkout.open({
          transactionId,
          settings: {
            // Absolute by Paddle's rule. The account page reads ?checkout=success already.
            successUrl: `${window.location.origin}/premium?checkout=success`,
          },
        });
      })
      .catch(() => this.failed.set(true));
  }
}
