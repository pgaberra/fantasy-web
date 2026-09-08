import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProjectionStorageService } from '../../services/projection-storage.service';
import { NotificationService } from '../../services/notification.service';
import { ProjectionResponse } from '../../api/models/projection-response';

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
 * Copies a board someone published under a share link, and says what went wrong when it can't.
 *
 * <p>It lives here rather than on the page because two pages take share links now — the draft
 * picker, where an imported board is something to draft against, and the new-projection page,
 * where it is a starting point — and the awkward parts (what counts as a link, a name already
 * taken, a link that has gone) are worth having in one place rather than two.
 */
@Component({
  selector: 'app-share-import',
  templateUrl: './share-import.html',
  styleUrl: './share-import.css',
})
export class ShareImportComponent {
  private readonly storage = inject(ProjectionStorageService);
  private readonly notification = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  /** Names what the copy is for, which differs between the pages that take one. */
  readonly label = input('Add a shared projection');

  readonly imported = output<ProjectionResponse>();

  readonly shareInput = signal('');
  readonly isImporting = signal(false);
  readonly importHint = signal<string | null>(null);
  /** Non-null only after a name clash, which is the one thing the importer has to settle. */
  readonly importName = signal<string | null>(null);

  /**
   * The form's own submit, stopped before the browser acts on it. Without this the press
   * navigates the page instead of importing, and the new-projection page comes back reloaded
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
      this.importHint.set("That doesn't look like a SlapStat share link.");
      return;
    }
    const chosenName = this.importName()?.trim();
    if (this.importName() !== null && !chosenName) {
      this.importHint.set('Enter a name for this copy.');
      return;
    }
    this.importHint.set(null);
    this.isImporting.set(true);
    this.storage
      .importFromShare(token, chosenName || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projection) => {
          this.isImporting.set(false);
          this.shareInput.set('');
          this.importName.set(null);
          this.imported.emit(projection);
        },
        error: (error: unknown) => {
          this.isImporting.set(false);
          this.onFailed(error);
        },
      });
  }

  /**
   * A name clash is the importer's to settle — two people can call a projection the same thing,
   * and only the one copying can say what the second should be called — so it asks for a name
   * rather than reporting a failure they could do nothing about.
   */
  private onFailed(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.importName.set(this.importName() ?? '');
      this.importHint.set('A board with that name already exists. Choose another name.');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.importHint.set('That share link is no longer active.');
      return;
    }
    this.notification.error("Couldn't import that board. Please try again.");
  }
}
