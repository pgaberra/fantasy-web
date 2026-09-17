import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { AccountService } from '../services/account.service';
import { FeatureService } from '../services/feature.service';
import { ProjectionResponse } from '../api/models/projection-response';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { AiProjectionAccess } from '../shared/premium/ai-projection-access';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { ShareImportComponent } from '../shared/share-import/share-import';
import { IconComponent } from '../shared/icon/icon';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { environment } from '../../environments/environment';

/**
 * Where a signed-in user starts (`/home`).
 *
 * <p>The page is the app's features side by side, each with its own way in, so someone can start
 * wherever they like: a projection to edit, a draft straight from a preset, the AI projection, or
 * a board someone shared. It began as a two-step checklist (create a projection, then try Draft
 * mode), which Alexander took out: it told everyone there was one right order, and there is not.
 *
 * <p>Only one thing on it depends on the account: a returning user gets the projection they
 * updated last across the top, so the page is also the way back into their work.
 */
@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    LoadingIndicatorComponent,
    ErrorStateComponent,
    ShareImportComponent,
    IconComponent,
    RelativeTimePipe,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent {
  private readonly storage = inject(ProjectionStorageService);
  private readonly router = inject(Router);
  private readonly features = inject(FeatureService);
  private readonly aiProjectionAccess = inject(AiProjectionAccess);
  protected readonly account = inject(AccountService);

  protected readonly whosHotEnabled = environment.whosHotEnabled;
  protected readonly espnLeaguesEnabled = environment.espnLeaguesEnabled;

  readonly projectionsResource = rxResource({
    stream: () => this.storage.listEditable(),
    defaultValue: [],
  });

  /** What the user can open in the editor, most recently updated first. */
  readonly editable = computed(() =>
    [...this.projectionsResource.value()].sort((first, second) =>
      second.updatedAt.localeCompare(first.updatedAt),
    ),
  );

  readonly latest = computed<ProjectionSummaryResponse | null>(() => this.editable()[0] ?? null);
  readonly projectionCount = computed(() => this.editable().length);

  readonly welcomeBack = computed(() => {
    const username = this.account.username();
    return username ? `Welcome back, ${username}` : 'Welcome back';
  });

  /**
   * The AI projection card is drawn wherever the environment serves the model; what its button
   * does depends on whether this account has bought it. An environment that does not serve it has
   * nothing to show or sell, so the card goes.
   */
  readonly aiProjectionServed = this.features.aiProjection;
  readonly aiProjectionLocked = this.aiProjectionAccess.locked;

  draftLabel(projection: ProjectionSummaryResponse): string {
    switch (projection.draftStatus) {
      case 'finished':
        return 'View summary';
      case 'in_progress':
        return 'Resume draft';
      default:
        return 'Draft mode';
    }
  }

  retry(): void {
    this.projectionsResource.reload();
  }

  onImported(projection: ProjectionResponse): void {
    void this.router.navigate(['/projections', projection.id]);
  }
}
