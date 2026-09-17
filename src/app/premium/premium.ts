import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';
import { EntitlementService } from '../services/entitlement.service';
import { FeatureService } from '../services/feature.service';
import { NotificationService } from '../services/notification.service';
import { freeFeatures, premiumPerks } from '../shared/premium/premium-perks';
import { environment } from '../../environments/environment';
import { IconComponent } from '../shared/icon/icon';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';

/** How long to keep waiting for the subscription to reach us before saying so, in milliseconds. */
const CONFIRMATION_TIMEOUT_MS = 30_000;

/** How long to wait between reads while confirming, in milliseconds. */
const CONFIRMATION_POLL_MS = 2_000;

/** Premium's price is set in US dollars, and both cards write their figure this one way. */
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** The build's base price (`PREMIUM_BASE_PRICE_USD`), or null when the build gives none. */
function basePriceUsd(): number | null {
  const raw = environment.premiumBasePriceUsd;
  const amount = Number(raw);
  return raw && Number.isFinite(amount) ? amount : null;
}

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
   * Stripe redirects the browser the moment the payment clears and tells our server separately,
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
    | 'coming-soon'
  >(() => {
    // While Premium is announced but not sold, every card that would lead to checkout, the
    // sign-in prompt included, says so instead: signing in to reach a disabled button is a
    // detour with nothing at the end of it.
    if (!this.authService.isLoggedIn()) {
      return environment.premiumComingSoon ? 'coming-soon' : 'signed-out';
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
        return environment.premiumComingSoon ? 'coming-soon' : 'buy';
      default:
        return 'loading';
    }
  });

  /**
   * Premium's monthly price, from the build. The same figure the prerendered page states, so a
   * reader with JavaScript and one without read one price. Checkout may show it converted into the
   * buyer's own currency.
   */
  protected readonly formattedPrice: string | null = (() => {
    const amount = basePriceUsd();
    return amount === null ? null : usd.format(amount);
  })();

  /**
   * The free plan's price, written the way the Premium one is ("$0.00" beside "$4.99"), and the
   * word "Free" when there is no Premium price to match.
   */
  protected readonly freePrice: string | null = this.formattedPrice === null ? null : usd.format(0);

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
    // changed, so the page re-reads it rather than trusting what the session loaded earlier. A
    // signed-out visitor has no plan to read, and the service asks nothing for one.
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
