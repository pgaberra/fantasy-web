import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
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
  readonly label = input('Add a shared board');

  /**
   * Whether it draws its own Import button. The new-projection page turns it off: there the
   * paste is a starting point like any other, so it is the page's own Create button that
   * imports, and a second button beside the field would only ask for a step nobody needs.
   */
  readonly showSubmit = input(true);

  readonly imported = output<ProjectionResponse>();

  /** An import that got nowhere, so a page waiting on one can stop waiting. */
  readonly failed = output<void>();

  /** Someone typing in the field, so a page can drop whatever else it had picked. */
  readonly linkChanged = output<void>();

  readonly shareInput = signal('');
  readonly isImporting = signal(false);
  readonly importHint = signal<string | null>(null);
  /** Non-null only after a name clash, which is the one thing the importer has to settle. */
  readonly importName = signal<string | null>(null);

  /** Whether there is anything to import — what a page driving this offers its button on. */
  readonly hasLink = computed(() => this.shareInput().trim().length > 0);

  onInput(value: string): void {
    this.shareInput.set(value);
    this.linkChanged.emit();
  }

  /** Drops what was pasted, for a page where picking something else abandons it. */
  clear(): void {
    this.shareInput.set('');
    this.importName.set(null);
    this.importHint.set(null);
  }

  submit(): void {
    const token = shareTokenFrom(this.shareInput());
    if (!token) {
      this.importHint.set("That doesn't look like a SlapStat share link.");
      this.failed.emit();
      return;
    }
    const chosenName = this.importName()?.trim();
    if (this.importName() !== null && !chosenName) {
      this.importHint.set('Give the copy a name.');
      this.failed.emit();
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
    this.failed.emit();
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.importName.set(this.importName() ?? '');
      this.importHint.set('You already have a board with that name. Give this copy another.');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.importHint.set("That link isn't active any more.");
      return;
    }
    this.notification.error("Couldn't import that board. Please try again.");
  }
}
