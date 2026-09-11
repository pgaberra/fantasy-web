import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';
import { EntitlementService } from '../services/entitlement.service';
import { ErrorReportingService } from '../services/error-reporting.service';
import { FeatureService } from '../services/feature.service';
import { NotificationService } from '../services/notification.service';
import { PaddleConfigurationError } from '../shared/paddle/paddle';
import { PaddleService } from '../shared/paddle/paddle.service';
import { freeFeatures, premiumPerks } from '../shared/premium/premium-perks';
import { environment } from '../../environments/environment';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';

/** How long to keep waiting for the subscription to reach us before saying so, in milliseconds. */
const CONFIRMATION_TIMEOUT_MS = 30_000;

/** How long to wait between reads while confirming, in milliseconds. */
const CONFIRMATION_POLL_MS = 2_000;

/**
 * Premium: the free plan and Premium side by side, what each includes, and the one thing to do
 * about it, whichever plan the reader is on.
 *
 * One page rather than two. The subscription page it replaces said "Premium active" and offered
 * the billing portal under a heading and a perk list the pricing cards already carried, so a
 * subscriber who opened it read the same page twice, and a free account that reached it was told
 * it had no subscription before being sent here anyway. Now the Premium card carries the plan: a
 * stranger is asked to sign in, a free account is offered checkout, and a subscriber sees their
 * status, their next charge or their last day, and the billing portal, in the place the Subscribe
 * button would have been.
 *
 * Two cards rather than one on purpose. A lone Premium card that listed "everything in the free
 * app" as its first perk left the reader to guess what the free app was, and so what they would
 * actually be paying for. Beside the free column, Premium's perks read as the difference.
 */
@Component({
  selector: 'app-premium',
  imports: [RouterLink, DatePipe, LoadingIndicatorComponent, IconComponent],
  templateUrl: './premium.html',
  styleUrl: './premium.css',
})
export class PremiumComponent implements OnInit, OnDestroy {
  private readonly billing = inject(BillingService);
  private readonly notifications = inject(NotificationService);
  private readonly errorReporting = inject(ErrorReportingService);
  private readonly paddle = inject(PaddleService);
  private readonly route = inject(ActivatedRoute);
  protected readonly authService = inject(AuthService);
  protected readonly entitlement = inject(EntitlementService);
  private readonly features = inject(FeatureService);
  protected readonly starting = signal(false);
  protected readonly openingPortal = signal(false);
  protected readonly justSubscribed = signal(false);

  protected readonly perks = computed(() => premiumPerks(this.features.aiProjection()));
  protected readonly freeFeatures = freeFeatures();

  /**
   * True while we are back from a completed checkout but the subscription has not reached us yet.
   *
   * Paddle redirects the browser the moment the payment clears and tells our server separately,
   * over a webhook. The redirect usually wins that race, so the first read of the entitlement
   * says the account is on the free plan. Rendering that verdict put a Subscribe button in front
   * of someone who had just paid, directly beneath a banner thanking them for subscribing;
   * reloading a few seconds later put it right. So the free verdict is held back and we keep
   * asking, rather than reporting an absence that is really a race.
   */
  protected readonly confirming = signal(false);

  /** Set when the wait ran out. Distinguishes "still on its way" from "never arrived". */
  protected readonly confirmationTimedOut = signal(false);

  /**
   * What the Premium card offers this reader. One computed rather than a ladder of conditions in
   * the template, because the states are mutually exclusive and the order between them is the
   * point: a subscriber must never be handed a second Subscribe button, and an entitlement that
   * has not landed yet must not be reported as a free plan.
   */
  protected readonly cta = computed<
    | 'signed-out'
    | 'premium'
    | 'granted'
    | 'confirming'
    | 'confirmation-timeout'
    | 'loading'
    | 'error'
    | 'buy'
  >(() => {
    if (!this.authService.isLoggedIn()) {
      return 'signed-out';
    }
    // Premium that was given rather than bought has no subscription behind it, so the portal
    // would open on nothing. 'both' is not one of these: there is still a subscription to manage.
    if (this.entitlement.premium() && this.entitlement.granted()) {
      return 'granted';
    }
    if (this.entitlement.premium()) {
      return 'premium';
    }
    if (this.confirming()) {
      return 'confirming';
    }
    if (this.confirmationTimedOut()) {
      return 'confirmation-timeout';
    }
    switch (this.entitlement.loadState()) {
      case 'error':
        return 'error';
      case 'loaded':
        return 'buy';
      default:
        return 'loading';
    }
  });

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

  /**
   * The free plan's price: Paddle's own Premium price with its number swapped for a zero, so
   * "49,00 kr" gives "0 kr" and "$4.99" gives "$0". Null until that price is known, and if it
   * never arrives.
   *
   * Taken from Paddle's string rather than formatted here because the two figures sit side by
   * side and have to read as one shop. Paddle formats for the buyer's country; formatting the
   * zero for the browser's language wrote "SEK 0" beside "49,00 kr" for a Swede whose browser
   * is in English.
   *
   * With no Paddle price the row stays empty. The word "Free" there only repeated the heading.
   */
  protected readonly freePrice = computed(() => {
    const price = this.formattedPrice();
    return price ? zeroIn(price) : null;
  });

  /**
   * True until Paddle has answered or failed to. Not the same as the price being null, which is
   * also what a failure leaves: while waiting the card says it is loading, after a failure it says
   * where the price will be confirmed instead.
   */
  protected readonly pricePending = signal(true);

  private pollTimer?: ReturnType<typeof setTimeout>;
  private giveUpTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Whichever read sees it first, the initial one or a poll, ends the wait.
    effect(() => {
      if (this.entitlement.premium() && this.confirming()) {
        this.stopConfirming();
      }
    });
  }

  ngOnInit(): void {
    // Back from checkout or the billing portal, where the plan is exactly what may have just
    // changed, so the page re-reads it rather than trusting what the session loaded earlier.
    if (this.route.snapshot.queryParamMap.get('checkout') === 'success') {
      this.justSubscribed.set(true);
      this.confirming.set(true);
      this.giveUpTimer = setTimeout(() => {
        this.confirming.set(false);
        this.confirmationTimedOut.set(true);
      }, CONFIRMATION_TIMEOUT_MS);
      this.scheduleNextRead();
    }
    this.entitlement.refresh();

    const priceId = environment.paddlePriceId;
    if (!environment.paddleClientToken || !priceId) {
      this.pricePending.set(false);
      return;
    }

    this.paddle
      .initialize({ token: environment.paddleClientToken })
      .then((paddle) => paddle?.PricePreview({ items: [{ priceId, quantity: 1 }] }))
      .then((preview) => {
        const lineItem = preview?.data.details.lineItems[0];
        if (lineItem) {
          this.formattedPrice.set(lineItem.formattedTotals.total);
        }
      })
      // Deliberately quiet about Paddle being unreachable. A price we could not fetch is a smaller
      // problem than an error toast on a marketing page, and the card still reads correctly
      // without it. A token that names no Paddle environment is a broken build instead, and is
      // reported, since a card that reads fine would otherwise hide it.
      .catch((error: unknown) => {
        if (error instanceof PaddleConfigurationError) {
          this.errorReporting.report(error);
        }
        this.formattedPrice.set(null);
      })
      .finally(() => this.pricePending.set(false));
  }

  ngOnDestroy(): void {
    this.stopConfirming();
  }

  reload(): void {
    this.confirmationTimedOut.set(false);
    this.entitlement.refresh();
  }

  subscribe(): void {
    this.starting.set(true);
    this.billing.startCheckout().subscribe({
      next: (response) => {
        window.location.href = response.checkoutUrl;
      },
      error: (error: unknown) => {
        this.starting.set(false);
        // 409: the account already has a live subscription, say one started in another tab a
        // moment ago. The BFF refused a second checkout, so nothing was charged, and reading the
        // plan again turns this card into the subscriber's view, which says the rest.
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.entitlement.refresh();
          return;
        }
        // No "please try again". The BFF answers 502 here, and it does so for faults on our
        // side: a misconfigured payment provider, a key that stopped working. Retrying that
        // never helps, and at a payment step the thing worth saying is that no money moved.
        this.notifications.error('Checkout could not be started. Nothing was charged.');
      },
    });
  }

  manageBilling(): void {
    this.openingPortal.set(true);
    this.billing.openPortal().subscribe({
      next: (response) => {
        window.location.href = response.portalUrl;
      },
      error: () => {
        this.openingPortal.set(false);
        // Same reasoning as the checkout message: this fails when something on our side is
        // wrong, so the useful thing to say is that the subscription itself is untouched.
        this.notifications.error(
          'The billing portal could not be opened. Your subscription is unchanged, and we have been notified.',
        );
      },
    });
  }

  private scheduleNextRead(): void {
    this.pollTimer = setTimeout(() => {
      if (!this.confirming()) {
        return;
      }
      this.entitlement.refresh();
      this.scheduleNextRead();
    }, CONFIRMATION_POLL_MS);
  }

  private stopConfirming(): void {
    this.confirming.set(false);
    clearTimeout(this.pollTimer);
    clearTimeout(this.giveUpTimer);
  }
}

/**
 * A formatted price with its number, separators and decimals included, replaced by a single
 * zero: "49,00 kr" is "0 kr", "SEK 1 234.00" is "SEK 0", "$4.99" is "$0". Without decimals
 * because a price of nothing has none to say. Null when there is no number to replace, so a
 * string of an unexpected shape leaves the row empty rather than wrong.
 */
export function zeroIn(formattedPrice: string): string | null {
  const zero = formattedPrice.replace(/\d(?:[\d.,'\s]*\d)?/, '0');
  return zero === formattedPrice ? null : zero;
}
