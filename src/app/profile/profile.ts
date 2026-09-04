import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
import { AccountService } from '../services/account.service';
import {
  ACCEPTED_AVATAR_ACCEPT,
  AvatarImageService,
  UnreadableImageError,
  UnsupportedImageTypeError,
} from '../services/avatar-image.service';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { PlayerHeadshotComponent } from '../shared/player-headshot/player-headshot';
import { USERNAME_MAX_LENGTH, USERNAME_PATTERN, USERNAME_RULE } from '../models/username';
import { messageForError } from '../shared/http-error';

/**
 * The account as the app shows it: the picture in the header and the public name. Sharing forces
 * the choice of a name, but it has to be changeable somewhere afterwards — a shared page credits
 * the current name, so this is what a reader sees.
 */
@Component({
  selector: 'app-profile',
  imports: [LoadingIndicatorComponent, ErrorStateComponent, PlayerHeadshotComponent],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent implements OnInit {
  private readonly account = inject(AccountService);
  private readonly avatarImages = inject(AvatarImageService);

  readonly usernameMaxLength = USERNAME_MAX_LENGTH;
  readonly usernameRule = USERNAME_RULE;
  readonly acceptedAvatarTypes = ACCEPTED_AVATAR_ACCEPT;

  readonly isLoading = signal<boolean>(true);
  readonly loadFailed = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly email = signal<string>('');
  readonly username = signal<string | null>(null);
  readonly usernameInput = signal<string>('');
  readonly errorMessage = signal<string | null>(null);
  readonly justSaved = signal<boolean>(false);

  readonly avatarUrl = this.account.avatarUrl;
  readonly isUploading = signal<boolean>(false);
  readonly avatarError = signal<string | null>(null);
  readonly displayName = computed(() => this.username() ?? this.email());

  readonly canSave = computed(() => {
    const candidate = this.usernameInput().trim();
    return USERNAME_PATTERN.test(candidate) && candidate !== this.username();
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.loadFailed.set(false);
    this.account.load().subscribe({
      next: (account) => {
        this.email.set(account.email);
        this.username.set(account.username ?? null);
        this.usernameInput.set(account.username ?? '');
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  onUsernameInput(event: Event): void {
    this.usernameInput.set((event.target as HTMLInputElement).value);
  }

  save(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.justSaved.set(false);
    this.account.setUsername(this.usernameInput().trim()).subscribe({
      next: (account) => {
        this.username.set(account.username ?? null);
        this.isSaving.set(false);
        this.justSaved.set(true);
      },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse && error.status === 409
            ? 'That name is taken. Try another.'
            : messageForError(error, "Couldn't save your name."),
        );
      },
    });
  }

  onAvatarPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same file again after a failure fires another change event.
    input.value = '';
    if (!file) {
      return;
    }
    this.isUploading.set(true);
    this.avatarError.set(null);
    from(this.avatarImages.prepare(file))
      .pipe(switchMap((image) => this.account.setAvatar(image)))
      .subscribe({
        next: () => this.isUploading.set(false),
        error: (error: unknown) => {
          this.isUploading.set(false);
          this.avatarError.set(this.messageForAvatarError(error));
        },
      });
  }

  /**
   * The formats we take are no longer written under the button, so a file we cannot use has to
   * say so itself — the message names them where the hint used to.
   */
  private messageForAvatarError(error: unknown): string {
    if (error instanceof UnsupportedImageTypeError) {
      return 'Unsupported file format. Please upload a PNG, JPEG, or WebP image.';
    }
    if (error instanceof UnreadableImageError) {
      return "Couldn't read that file as a picture. Try a PNG or JPEG.";
    }
    return messageForError(error, "Couldn't save your picture.");
  }

  removeAvatar(): void {
    this.isUploading.set(true);
    this.avatarError.set(null);
    this.account.removeAvatar().subscribe({
      next: () => this.isUploading.set(false),
      error: (error: unknown) => {
        this.isUploading.set(false);
        this.avatarError.set(messageForError(error, "Couldn't remove your picture."));
      },
    });
  }
}
