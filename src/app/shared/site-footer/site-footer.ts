import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FeatureService } from '../../services/feature.service';
import { feedbackPage } from '../../services/feedback.service';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.css',
})
export class SiteFooterComponent {
  readonly authService = inject(AuthService);
  readonly featureService = inject(FeatureService);
  private readonly router = inject(Router);

  /** The page the reader is on, so a bug report can say where it happened. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  feedbackFrom(): string | undefined {
    const page = feedbackPage(this.url());
    return page === '/feedback' ? undefined : page;
  }
}
