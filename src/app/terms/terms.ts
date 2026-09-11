import { DOCUMENT } from '@angular/common';
import { afterRenderEffect, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

/**
 * Terms and conditions.
 *
 * Static, public and unguarded, like the privacy policy: Paddle's website review requires
 * terms, a refund policy and visible pricing to be reachable without an account, and a
 * customer deciding whether to pay has to be able to read them before they do. Refunds are a
 * section of these terms rather than a page of their own, so there is one contract to read and
 * only one place for the cancellation wording to go stale. The section has its own `#refunds`
 * heading because the review also wants the refund policy reachable from the navigation, and
 * the footer links straight to it.
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
  private readonly document = inject(DOCUMENT);
  private readonly fragment = toSignal(inject(ActivatedRoute).fragment);

  protected readonly lastUpdated = '8 September 2026';

  constructor() {
    // The page scrolls to its own section when a link lands on one. Switching on the router's
    // anchor scrolling would do this for every route, including pages that use a fragment for
    // something else, such as the profile's #username, which focuses a field.
    afterRenderEffect(() => {
      const fragment = this.fragment();
      if (fragment) {
        this.document.getElementById(fragment)?.scrollIntoView();
      }
    });
  }
}
