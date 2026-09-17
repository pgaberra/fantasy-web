import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Refund policy.
 *
 * Static, public and unguarded, like the terms and the privacy policy: a payment provider's
 * review asks for publicly accessible Terms of Service, Privacy Policy and Refund Policy pages,
 * and a customer deciding whether to pay has to be able to read them before they do.
 *
 * The terms point here for refunds rather than repeating them, so this wording has one home. It
 * describes what actually happens: cancelling is done in Stripe's billing portal, opened from the
 * Premium page, and every refund goes back to the payment method used. If those mechanics
 * change, this page changes with them.
 */
@Component({
  selector: 'app-refunds',
  imports: [RouterLink],
  templateUrl: './refunds.html',
  styleUrl: './refunds.css',
})
export class RefundsComponent {
  protected readonly lastUpdated = '17 September 2026';
}
