import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CheckoutEventNames, type Paddle } from '@paddle/paddle-js';
import { environment } from '../../environments/environment';
import { ErrorReportingService } from '../services/error-reporting.service';
import { initializePaddleForToken, PaddleConfigurationError } from '../shared/paddle/paddle';

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
  private readonly errorReporting = inject(ErrorReportingService);

  protected readonly failed = signal(false);

  ngOnInit(): void {
    const transactionId = this.route.snapshot.queryParamMap.get('_ptxn');
    if (!transactionId || !environment.paddleClientToken) {
      this.failed.set(true);
      return;
    }

    initializePaddleForToken({
      token: environment.paddleClientToken,
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
            // Stated rather than inherited from Paddle's defaults. The overlay is theirs already;
            // the one-page variant asks for the email and the card together, where the default
            // spends a whole step on the email. When the account's email is verified, the BFF has
            // attached it to the transaction, so that step would only have been a click.
            displayMode: 'overlay',
            variant: 'one-page',
            // Absolute by Paddle's rule. The account page reads ?checkout=success already.
            successUrl: `${window.location.origin}/premium?checkout=success`,
          },
        });
      })
      .catch((error: unknown) => {
        // A token whose environment cannot be told is a broken build, and this page saying
        // checkout failed is all anyone would otherwise hear of it.
        if (error instanceof PaddleConfigurationError) {
          this.errorReporting.report(error);
        }
        this.failed.set(true);
      });
  }
}
