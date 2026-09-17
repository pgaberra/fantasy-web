import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { AccountService } from '../services/account.service';
import { FeatureService } from '../services/feature.service';
import { ProjectionResponse } from '../api/models/projection-response';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { AiProjectionAccess } from '../shared/premium/ai-projection-access';
import { premiumPerks } from '../shared/premium/premium-perks';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { ShareImportComponent } from '../shared/share-import/share-import';
import { IconComponent } from '../shared/icon/icon';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { environment } from '../../environments/environment';

/** How many projections besides the latest the page lists before pointing at the full list. */
const MAX_OTHER_PROJECTIONS = 3;

/**
 * Where a signed-in user starts (`/home`).
 *
 * <p>A new account used to land on an empty projections list, which said what was missing and
 * nothing about the rest of the app. This page leads with the two things that get someone ready
 * for a draft and, once they have work, with the projection they touched last.
 *
 * <p>The checklist is **derived, never stored**: a step is done when the account's projections
 * say it is, so it cannot disagree with what the user sees elsewhere and needs nothing from the
 * BFF beyond the list it already serves. Syncing league settings is deliberately not a step,
 * since the list does not say whether a projection is synced.
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

  // Preset drafts included: they are not projections to list, but starting one is using Draft mode.
  readonly projectionsResource = rxResource({
    stream: () => this.storage.listWithPresetDrafts(),
    defaultValue: [],
  });

  /** What the user can open in the editor, most recently updated first. */
  readonly editable = computed(() =>
    this.projectionsResource
      .value()
      .filter((projection) => projection.kind !== 'preset_draft')
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
  );

  readonly latest = computed<ProjectionSummaryResponse | null>(() => this.editable()[0] ?? null);
  readonly others = computed(() => this.editable().slice(1, 1 + MAX_OTHER_PROJECTIONS));
  readonly hasMoreProjections = computed(() => this.editable().length > 1 + MAX_OTHER_PROJECTIONS);

  readonly welcomeBack = computed(() => {
    const username = this.account.username();
    return username ? `Welcome back, ${username}` : 'Welcome back';
  });

  readonly hasProjection = computed(() => this.editable().length > 0);
  readonly hasDrafted = computed(() =>
    this.projectionsResource.value().some((projection) => projection.draftStatus !== 'none'),
  );
  readonly stepsDone = computed(() => Number(this.hasProjection()) + Number(this.hasDrafted()));
  readonly stepsTotal = 2;
  readonly showsDraftPrep = computed(() => this.stepsDone() < this.stepsTotal);

  /**
   * The AI projection, pitched once, and only to an account that could buy it in an environment
   * that serves it. The wording comes from the Premium page's own list, so the two cannot drift;
   * `premiumPerks` puts the AI projection first whenever it is served.
   */
  readonly aiProjectionPerk = computed(() =>
    this.aiProjectionAccess.locked() && this.features.aiProjection() ? premiumPerks(true)[0] : null,
  );

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
