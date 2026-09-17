import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Terms and conditions.
 *
 * Static, public and unguarded, like the privacy policy: a payment provider's website review requires
 * terms, a refund policy and visible pricing to be reachable without an account, and a customer
 * deciding whether to pay has to be able to read them before they do. The refund policy is a
 * section here (`#refunds`), and `/refunds` redirects to it, so the refund wording has one home.
 *
 * The content describes what actually happens, not what a template says might. If the
 * subscription mechanics change, this page changes with them.
 */
@Component({
  selector: 'app-terms',
  imports: [RouterLink],
  templateUrl: './terms.html',
  styleUrl: './terms.css',
})
export class TermsComponent {
  protected readonly lastUpdated = '17 September 2026';
}
