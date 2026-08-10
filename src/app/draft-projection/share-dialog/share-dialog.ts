import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SharedPlayer } from '../../api/models/shared-player';
import { ShareLinkResponse } from '../../api/models/share-link-response';
import { AnalyticsService } from '../../services/analytics.service';
import { NotificationService } from '../../services/notification.service';
import {
  ProjectionShareService,
  SHARED_PLAYER_COUNT,
} from '../../services/projection-share.service';
import { messageForError } from '../../shared/http-error';

/**
 * Publishing a projection as a public link. Opening the dialog only reads the current state —
 * nothing becomes public until the owner presses Share.
 */
@Component({
  selector: 'app-share-dialog',
  imports: [],
  templateUrl: './share-dialog.html',
  styleUrl: './share-dialog.css',
})
export class ShareDialogComponent implements OnInit {
  readonly projectionId = input.required<string>();
  readonly players = input.required<SharedPlayer[]>();
  readonly closed = output<void>();

  private readonly shareService = inject(ProjectionShareService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  readonly sharedCount = SHARED_PLAYER_COUNT;

  readonly isLoading = signal<boolean>(true);
  readonly isSaving = signal<boolean>(false);
  readonly share = signal<ShareLinkResponse | null>(null);
  readonly authorAlias = signal<string>('');
  readonly errorMessage = signal<string | null>(null);
  readonly copied = signal<boolean>(false);

  ngOnInit(): void {
    this.shareService.getShare(this.projectionId()).subscribe({
      next: (share) => {
        this.share.set(share);
        this.authorAlias.set(share.authorAlias ?? '');
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.isLoading.set(false);
        // A projection that has never been shared has no share to fetch — that is the normal
        // first-time case, not a failure worth showing.
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return;
        }
        this.errorMessage.set(messageForError(error, "Couldn't check whether this is shared."));
      },
    });
  }

  onAliasInput(event: Event): void {
    this.authorAlias.set((event.target as HTMLInputElement).value);
  }

  publish(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.shareService.share(this.projectionId(), this.players(), this.authorAlias()).subscribe({
      next: (share) => {
        // The whole point of sharing is the loop back to sign-ups, so both ends of it are
        // measured: this event and shared_projection_viewed on the public page.
        this.analytics.capture('projection_shared', { players: this.players().length });
        this.share.set(share);
        this.isSaving.set(false);
      },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.errorMessage.set(messageForError(error, "Couldn't share this projection."));
      },
    });
  }

  unshare(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.shareService.unshare(this.projectionId()).subscribe({
      next: () => {
        this.share.set(null);
        this.copied.set(false);
        this.isSaving.set(false);
      },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.errorMessage.set(messageForError(error, "Couldn't take the link down."));
      },
    });
  }

  async copyLink(): Promise<void> {
    const url = this.share()?.shareUrl;
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
    } catch {
      // Clipboard access can be denied outright (permissions, an insecure context); the link is
      // on screen and selectable, so say so rather than failing silently.
      this.notification.error('Copying failed — select the link and copy it manually.');
    }
  }
}
