import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Refund policy.
 *
 * Static, public and unguarded, like the privacy policy: Paddle's website review requires
 * terms, a refund policy and visible pricing to be reachable without an account, and a
 * customer deciding whether to pay has to be able to read them before they do.
 *
 * The content describes what actually happens, not what a template says might. If the
 * subscription mechanics change, this page changes with them.
 */
@Component({
  selector: 'app-refunds',
  imports: [RouterLink],
  templateUrl: './refunds.html',
  styleUrl: './refunds.css',
})
export class RefundsComponent {
  protected readonly lastUpdated = '6 September 2026';
}
