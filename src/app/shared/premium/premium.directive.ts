import { Directive, effect, inject, TemplateRef, ViewContainerRef } from '@angular/core';
import { EntitlementService } from '../../services/entitlement.service';

/**
 * Structural directive that renders its content only while the user has premium access, and reacts
 * to the entitlement signal changing (e.g. right after a checkout completes). Usage:
 * {@code <div *appPremium>Premium-only content</div>}. UX-only — never the security boundary.
 */
@Directive({ selector: '[appPremium]' })
export class PremiumDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly entitlement = inject(EntitlementService);

  constructor() {
    effect(() => {
      const premium = this.entitlement.premium();
      this.viewContainer.clear();
      if (premium) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      }
    });
  }
}
