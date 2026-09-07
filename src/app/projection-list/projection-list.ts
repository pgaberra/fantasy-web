import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { PendingProjectionService } from '../services/pending-projection.service';
import { ProjectionData } from '../api/models/projection-data';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { ProjectionCardComponent } from './projection-card/projection-card';
import { ShareDialogComponent } from '../draft-projection/share-dialog/share-dialog';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { freeProjectionName } from '../services/projection-name';
import { SharedPlayer } from '../api/models/shared-player';

@Component({
  selector: 'app-projection-list',
  imports: [
    LoadingIndicatorComponent,
    ErrorStateComponent,
    ProjectionCardComponent,
    ShareDialogComponent,
  ],
  templateUrl: './projection-list.html',
  styleUrl: './projection-list.css',
})
export class ProjectionListComponent {
  private readonly storage = inject(ProjectionStorageService);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);
  private readonly pendingProjection = inject(PendingProjectionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly playerService = inject(PlayerService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly projectionShare = inject(ProjectionShareService);

  readonly projectionsResource = rxResource({
    stream: () => this.storage.listEditable(),
    defaultValue: [],
  });

  // Holds the loading indicator up while a projection carried over from the landing demo is
  // being saved, so the visitor never sees an empty list flash before reaching the editor.
  readonly isSavingDemo = signal(false);

  // Sharing needs the ranked rows, and ranking needs the projection plus the whole player pool
  // — neither of which this page loads to list projections. Both are fetched on the click, so
  // the list stays as light as it was for everyone who never presses Share.
  readonly sharingProjectionId = signal<string | null>(null);
  readonly sharedPlayers = signal<SharedPlayer[]>([]);
  readonly preparingShareFor = signal<string | null>(null);
  private redeemAttempted = false;

  readonly sortedProjections = computed(() =>
    [...this.projectionsResource.value()].sort((first, second) =>
      second.updatedAt.localeCompare(first.updatedAt),
    ),
  );

  constructor() {
    // A visitor who edited the landing-page demo and signed up lands here; turn that stashed
    // work into their projection and take them straight to the editor.
    effect(() => {
      if (
        this.redeemAttempted ||
        this.projectionsResource.isLoading() ||
        this.projectionsResource.error()
      ) {
        return;
      }
      const pending = this.pendingProjection.peek();
      if (!pending) {
        return;
      }
      this.redeemAttempted = true;
      this.redeemDemoProjection(pending);
    });
  }

  private redeemDemoProjection(data: ProjectionData): void {
    // Saved beside whatever the account already holds, under a name none of those has taken —
    // work from the demo is a projection like any other now that a user may keep several.
    this.isSavingDemo.set(true);
    this.storage
      .createProjection({ name: this.freeName(), data })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          this.pendingProjection.clear();
          void this.router.navigate(['/projections', projection.id]);
        },
        // Keep the stash: reloading retries rather than silently losing their work.
        error: () => {
          this.isSavingDemo.set(false);
          this.notification.error("Couldn't save your projection from the demo. Try again.");
        },
      });
  }

  retry(): void {
    this.projectionsResource.reload();
  }

  createNew(): void {
    void this.router.navigate(['/projections/new']);
  }

  edit(id: string): void {
    void this.router.navigate(['/projections', id]);
  }

  draft(id: string): void {
    void this.router.navigate(['/projections', id, 'draft']);
  }

  share(id: string): void {
    this.preparingShareFor.set(id);
    forkJoin({
      projection: this.storage.loadProjection(id),
      players: this.playerService.getPlayers(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ projection, players }) => {
          const state = this.serializer.fromProjectionData(projection.data);
          const ranked = this.ranking.rankOverall({
            projections: state.playerProjections,
            scoringType: state.scoringType,
            statWeights: state.statWeights,
            activeScoringColumns: state.activeScoringColumns,
            leagueSize: state.leagueSize,
            rosterSlots: state.rosterSlots,
            minGoalieGames: state.minGoalieGames,
            decimalSettings: state.decimalSettings,
          });
          const playersById = new Map(players.map((player) => [player.id, player]));
          this.sharedPlayers.set(
            this.projectionShare.toSharedPlayers(ranked, playersById, state.scoringType),
          );
          this.preparingShareFor.set(null);
          this.sharingProjectionId.set(id);
        },
        error: () => {
          this.preparingShareFor.set(null);
          this.notification.error("Couldn't open sharing for this projection. Try again.");
        },
      });
  }

  closeShare(): void {
    this.sharingProjectionId.set(null);
  }

  /**
   * Throws away the picks played against a projection while the projection itself stays. The
   * card offers it wherever a draft has been started, finished or not, so a board can be
   * drafted afresh without deleting it and building it again.
   */
  discardDraft(id: string): Promise<void> {
    return firstValueFrom(this.storage.clearDraft(id))
      .then(() => {
        this.projectionsResource.reload();
      })
      .catch(() => this.notification.error("Couldn't discard the draft. Try again."));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.storage.deleteProjection(id))
      .then(() => {
        this.projectionsResource.reload();
      })
      .catch(() => this.notification.error("Couldn't delete the projection. Try again."));
  }

  /** Every board the user keeps shares one pool of names, imported ones included. */
  private freeName(): string {
    return freeProjectionName(
      this.projectionsResource.value().map((projection) => projection.name),
    );
  }
}
