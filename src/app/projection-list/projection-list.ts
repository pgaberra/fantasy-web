import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { freeProjectionName } from '../services/projection-name';
import { SharedPlayer } from '../api/models/shared-player';
import { IconComponent } from '../shared/icon/icon';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { renameOnOpenExtras } from '../draft-projection/rename-intent';
import { isFollowedBoard, isOwnBoard } from '../models/source-kind';

/** The two halves of the list: what the user can edit, and what they only follow. */
type ProjectionGroup = 'own' | 'following';

@Component({
  selector: 'app-projection-list',
  imports: [
    LoadingIndicatorComponent,
    ErrorStateComponent,
    ProjectionCardComponent,
    ShareDialogComponent,
    IconComponent,
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

  /**
   * The user's own work: what they made, the copies they took of projections shared with them,
   * and the spreadsheets they uploaded. All of it is theirs to edit, rename and share.
   */
  readonly ownProjections = computed(() => this.sortedProjections().filter(isOwnBoard));

  /** Somebody else's board, mirrored under their name until the user stops following it. */
  readonly followedProjections = computed(() => this.sortedProjections().filter(isFollowedBoard));

  readonly groups: readonly { readonly group: ProjectionGroup; readonly name: string }[] = [
    { group: 'own', name: 'Your projections' },
    { group: 'following', name: 'Following' },
  ];

  /** What the user pressed, if anything; `group` is what that comes to. */
  readonly selectedGroup = signal<ProjectionGroup | null>(null);

  /**
   * The group on screen. Their own work unless they asked for the other, with two exceptions:
   * an account that only follows opens on what it has, and unfollowing the last board takes the
   * control away, so the page cannot be left on a group there is no longer a way out of.
   */
  readonly group = computed<ProjectionGroup>(() => {
    if (this.followedProjections().length === 0) {
      return 'own';
    }
    return this.selectedGroup() ?? (this.ownProjections().length > 0 ? 'own' : 'following');
  });

  readonly shownProjections = computed(() =>
    this.group() === 'own' ? this.ownProjections() : this.followedProjections(),
  );

  readonly copyingFollow = signal<string | null>(null);

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
          this.notification.error("Couldn't save the demo projection. Please try again.");
        },
      });
  }

  /** Said on the control, so the group not open is honest about what is behind it. */
  groupCount(group: ProjectionGroup): number {
    return group === 'own' ? this.ownProjections().length : this.followedProjections().length;
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

  /**
   * Takes a copy of a followed projection and opens it ready to be renamed, exactly as the
   * button in the editor does. It goes through the share token rather than the projection's id,
   * because a copy is of what is published now and a follow may be a moment behind it.
   */
  createCopy(projection: ProjectionSummaryResponse): void {
    const origin = projection.origin;
    if (!origin || this.copyingFollow()) {
      return;
    }
    this.copyingFollow.set(projection.id);
    this.storage
      .copyFromShare(origin.shareToken)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (copy) => {
          this.copyingFollow.set(null);
          void this.router.navigate(['/projections', copy.id], renameOnOpenExtras);
        },
        error: (error: unknown) => {
          this.copyingFollow.set(null);
          // The follow goes when the share does, so a 404 means the author has just taken the
          // link down and this row is about to disappear with it.
          const gone = error instanceof HttpErrorResponse && error.status === 404;
          this.notification.error(
            gone
              ? 'That share link is no longer active.'
              : "Couldn't copy this projection. Please try again.",
          );
        },
      });
  }

  /**
   * Starts a draft against this board. Every press starts a new one — a draft is a row of its
   * own now, so the board is not limited to holding a single draft — and nothing is saved until
   * the setup on the draft page is confirmed. The drafts themselves are listed on /draft, which
   * is the one place any of them is resumed from.
   */
  draft(id: string): void {
    void this.router.navigate(['/draft/new/board', id]);
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
          this.sharedPlayers.set(this.projectionShare.rowsToPublish(state, players));
          this.preparingShareFor.set(null);
          this.sharingProjectionId.set(id);
        },
        error: () => {
          this.preparingShareFor.set(null);
          this.notification.error("Couldn't open sharing for this projection.");
        },
      });
  }

  closeShare(): void {
    this.sharingProjectionId.set(null);
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.storage.deleteProjection(id))
      .then(() => {
        this.projectionsResource.reload();
      })
      .catch(() => this.notification.error("Couldn't delete the projection. Please try again."));
  }

  /** Every board the user keeps shares one pool of names, imported ones included. */
  private freeName(): string {
    return freeProjectionName(
      this.projectionsResource.value().map((projection) => projection.name),
    );
  }
}
