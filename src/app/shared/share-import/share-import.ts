import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProjectionStorageService } from '../../services/projection-storage.service';
import { NotificationService } from '../../services/notification.service';
import { ProjectionResponse } from '../../api/models/projection-response';
import { LoadingIndicatorComponent } from '../loading-indicator/loading-indicator';

/**
 * Pulls the token out of whatever gets pasted: a whole share URL, the path from one, or the
 * token on its own. Anything else is not a link we published.
 */
export function shareTokenFrom(pasted: string): string | null {
  const trimmed = pasted.trim();
  const fromLink = /\/s\/([A-Za-z0-9_-]+)/.exec(trimmed);
  if (fromLink) {
    return fromLink[1];
  }
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

/**
 * Follows a projection somebody published under a share link, and says what went wrong when it
 * can't. A follow is a live mirror of theirs: read-only apart from the follower's own draft, and
 * rewritten whenever the author shares it again. Taking a copy instead is offered on the shared
 * page itself and in the editor, which is where someone is looking at the numbers and can tell
 * whether they want their own.
 *
 * <p>It lives here rather than on the page because three pages take share links now, and the
 * awkward parts (what counts as a link, a link already followed, a link that has gone) are worth
 * having in one place rather than three. The three word it identically, so the label is written
 * here too: a field that followed a board on one page and "imported" it on another was the same
 * action under two names.
 */
@Component({
  selector: 'app-share-import',
  imports: [LoadingIndicatorComponent],
  templateUrl: './share-import.html',
  styleUrl: './share-import.css',
})
export class ShareImportComponent {
  private readonly storage = inject(ProjectionStorageService);
  private readonly notification = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly followed = output<ProjectionResponse>();

  readonly shareInput = signal('');
  readonly isFollowing = signal(false);
  readonly followHint = signal<string | null>(null);
  /**
   * Whether the hint is a refusal or merely a remark. Following a link twice is not a failure:
   * the follow already held comes back, the page takes the user to it, and this says why there
   * is no second one.
   */
  readonly hintIsNote = signal(false);

  /**
   * The form's own submit, stopped before the browser acts on it. Without this the press
   * navigates the page instead of following, and the new-projection page comes back reloaded
   * on its first tab. `(ngSubmit)` would not do: it belongs to `FormsModule`, which nothing
   * here imports, so it binds to an event that never fires and lets the native submit through.
   */
  onSubmit(event: Event): void {
    event.preventDefault();
    this.submit();
  }

  submit(): void {
    const token = shareTokenFrom(this.shareInput());
    if (!token) {
      this.followHint.set("That doesn't look like a SlapStat share link.");
      return;
    }
    this.followHint.set(null);
    this.hintIsNote.set(false);
    this.isFollowing.set(true);
    this.storage
      .followShare(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.isFollowing.set(false);
          this.shareInput.set('');
          if (result.alreadyFollowed) {
            this.hintIsNote.set(true);
            this.followHint.set('You already follow this projection. Here it is.');
          }
          this.followed.emit(result.projection);
        },
        error: (error: unknown) => {
          this.isFollowing.set(false);
          this.onFailed(error);
        },
      });
  }

  /**
   * The two refusals a pasted link can earn that the user can do something about: a link that
   * has gone, and their own. Both are stated beside the field rather than in a toast, since the
   * field is what they would change.
   */
  private onFailed(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.followHint.set('That share link is no longer active.');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 400) {
      this.followHint.set("That's a link to your own projection.");
      return;
    }
    this.notification.error("Couldn't follow that projection. Please try again.");
  }
}
