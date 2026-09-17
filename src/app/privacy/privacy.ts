import { Component } from '@angular/core';

/**
 * Static privacy policy.
 *
 * Public and unguarded, like the terms: consent has to be informed, so the policy must be
 * readable from the cookie banner before anyone has agreed to anything, and a payment
 * provider's website review expects it reachable without an account.
 *
 * The content describes what the code actually does — the tables in db-service, the categories
 * of processor we really send data to, and the storage we really set. If any of those change,
 * this page has to change with them; it is not boilerplate, and a stale privacy policy is worse
 * than none. The spec pins the parts that would silently rot: the controller and contact, the
 * named third parties, the consent gate on analytics, and the promises about retention.
 */
@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.html',
  styleUrl: './privacy.css',
})
export class PrivacyComponent {
  protected readonly lastUpdated = '17 September 2026';
}
