import { Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BillingService } from '../services/billing.service';
import { EntitlementService } from '../services/entitlement.service';
import { NotificationService } from '../services/notification.service';
import { premiumPerks } from '../shared/premium/premium-perks';

/** How long to keep waiting for the subscription to reach us before saying so, in milliseconds. */
const CONFIRMATION_TIMEOUT_MS = 30_000;

/** How long to wait between reads while confirming, in milliseconds. */
const CONFIRMATION_POLL_MS = 2_000;

/**
 * The subscription page: which plan the account is on, and what to do about it.
 *
 * Reached from the account menu. A free account is told what Premium would add and offered the
 * pricing page; a subscriber is told when the next charge is, or when the last day is once they
 * have cancelled, and given the billing portal. Straight after checkout it is also the welcome:
 * the first thing a new subscriber should see is where the things they just paid for live.
 */
@Component({
  selector: 'app-account',
  imports: [RouterLink, DatePipe],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class AccountComponent implements OnInit, OnDestroy {
  private readonly billing = inject(BillingService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  protected readonly entitlement = inject(EntitlementService);
  protected readonly openingPortal = signal(false);
  protected readonly justSubscribed = signal(false);

  protected readonly perks = premiumPerks();

  /** The perks with a page to go to, for the welcome after checkout. */
  protected readonly nextSteps = this.perks.filter((perk) => perk.link);

  /**
   * True while we are back from a completed checkout but the subscription has not reached us yet.
   *
   * Paddle redirects the browser the moment the payment clears and tells our server separately,
   * over a webhook. The redirect usually wins that race, so the first read of the entitlement
   * says the account is on the free plan. Rendering that verdict told someone who had just paid
   * that they had no subscription, directly beneath a banner thanking them for subscribing;
   * reloading a few seconds later put it right. So the free-plan card is held back and we keep
   * asking, rather than reporting an absence that is really a race.
   */
  protected readonly confirming = signal(false);

  /** Set when the wait ran out. Distinguishes "still on its way" from "never arrived". */
  protected readonly confirmationTimedOut = signal(false);

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
    // Returning from checkout or the billing portal — re-read the possibly just-changed entitlement.
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
          "Couldn't open the billing portal. Your subscription is unchanged.",
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
