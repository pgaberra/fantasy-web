import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, switchMap } from 'rxjs';
import { SharedPlayer } from '../../api/models/shared-player';
import { ShareLinkResponse } from '../../api/models/share-link-response';
import { AccountService } from '../../services/account.service';
import { AnalyticsService } from '../../services/analytics.service';
import { NotificationService } from '../../services/notification.service';
import { ProjectionShareService } from '../../services/projection-share.service';
import { USERNAME_PATTERN, USERNAME_MAX_LENGTH } from '../../models/username';
import { messageForError } from '../../shared/http-error';

/**
 * Publishing a projection as a public link. Opening the dialog only reads the current state —
 * nothing becomes public until the owner presses the button, and publishing is one-way: there
 * is no way back from a published snapshot short of deleting the projection.
 *
 * A shared page credits the account's username, so an account without one has to pick a name
 * here first. That is deliberately the only place the choice is forced: signing up does not ask.
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
  private readonly account = inject(AccountService);
  private readonly notification = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  readonly usernameMaxLength = USERNAME_MAX_LENGTH;

  private readonly accountLoaded = signal<boolean>(false);
  private readonly shareLoaded = signal<boolean>(false);
  readonly isLoading = computed(() => !this.accountLoaded() || !this.shareLoaded());
  readonly isSaving = signal<boolean>(false);
  readonly share = signal<ShareLinkResponse | null>(null);
  readonly username = signal<string | null>(null);
  readonly usernameInput = signal<string>('');
  readonly errorMessage = signal<string | null>(null);
  readonly copied = signal<boolean>(false);

  readonly needsUsername = computed(() => !this.username());
  readonly canPublish = computed(
    () => !this.needsUsername() || USERNAME_PATTERN.test(this.usernameInput().trim()),
  );

  ngOnInit(): void {
    this.account.load().subscribe({
      next: (account) => {
        this.username.set(account.username ?? null);
        this.accountLoaded.set(true);
      },
      error: (error: unknown) => {
        this.accountLoaded.set(true);
        this.errorMessage.set(messageForError(error, "Couldn't load your account."));
      },
    });

    this.shareService.getShare(this.projectionId()).subscribe({
      next: (share) => {
        this.share.set(share);
        this.shareLoaded.set(true);
      },
      error: (error: unknown) => {
        this.shareLoaded.set(true);
        // A projection that has never been shared has no share to fetch — the normal first-time
        // case, not a failure worth showing.
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return;
        }
        this.errorMessage.set(messageForError(error, "Couldn't check whether this is shared."));
      },
    });
  }

  onUsernameInput(event: Event): void {
    this.usernameInput.set((event.target as HTMLInputElement).value);
  }

  publish(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);

    const claimName: Observable<unknown> = this.needsUsername()
      ? this.account.setUsername(this.usernameInput().trim())
      : of(null);

    claimName
      .pipe(switchMap(() => this.shareService.share(this.projectionId(), this.players())))
      .subscribe({
        next: (share) => {
          // The whole point of sharing is the loop back to sign-ups, so both ends of it are
          // measured: this event and shared_projection_viewed on the public page.
          this.analytics.capture('projection_shared', { players: this.players().length });
          this.username.set(this.account.username());
          this.share.set(share);
          this.isSaving.set(false);
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
          this.errorMessage.set(this.publishError(error));
        },
      });
  }

  /** A taken name is the one failure a user can actually do something about, so it says so. */
  private publishError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 409 && this.needsUsername()) {
      return 'That name is taken — try another.';
    }
    return messageForError(error, "Couldn't share this projection.");
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
