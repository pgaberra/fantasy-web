import {
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { from, switchMap } from 'rxjs';
import { AccountService } from '../services/account.service';
import { AuthService } from '../services/auth.service';
import {
  ACCEPTED_AVATAR_ACCEPT,
  AvatarImageService,
  isAcceptedAvatarType,
  UnreadableImageError,
  UnsupportedImageTypeError,
} from '../services/avatar-image.service';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { PlayerHeadshotComponent } from '../shared/player-headshot/player-headshot';
import { AvatarCropDialogComponent } from './avatar-crop-dialog/avatar-crop-dialog';
import { AvatarCrop } from '../models/avatar-crop';
import { USERNAME_MAX_LENGTH, USERNAME_PATTERN, USERNAME_RULE } from '../models/username';
import { messageForError } from '../shared/http-error';

/** Both of these are shown for a file the browser is not going to make a picture out of. */
const UNSUPPORTED_FORMAT = 'Unsupported file format. Use a PNG, JPEG, or WebP image.';
const UNREADABLE_FILE = 'That file could not be read as an image. Use a PNG or JPEG.';

/**
 * The account as the app shows it: the picture in the header and the public name. Sharing forces
 * the choice of a name, but it has to be changeable somewhere afterwards — a shared page credits
 * the current name, so this is what a reader sees.
 */
@Component({
  selector: 'app-profile',
  imports: [
    LoadingIndicatorComponent,
    ErrorStateComponent,
    PlayerHeadshotComponent,
    AvatarCropDialogComponent,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent implements OnInit {
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);
  private readonly avatarImages = inject(AvatarImageService);
  private readonly route = inject(ActivatedRoute);

  readonly usernameMaxLength = USERNAME_MAX_LENGTH;
  readonly usernameRule = USERNAME_RULE;
  readonly acceptedAvatarTypes = ACCEPTED_AVATAR_ACCEPT;

  readonly isLoading = signal<boolean>(true);
  readonly loadFailed = signal<boolean>(false);
  readonly loadFailure = signal<unknown>(undefined);
  readonly isSaving = signal<boolean>(false);
  readonly email = signal<string>('');
  readonly username = signal<string | null>(null);
  readonly usernameInput = signal<string>('');
  readonly errorMessage = signal<string | null>(null);
  readonly justSaved = signal<boolean>(false);

  readonly avatarUrl = this.account.avatarUrl;
  readonly isUploading = signal<boolean>(false);
  readonly avatarError = signal<string | null>(null);
  /** The picked file, while the user is placing the square that becomes the picture on it. */
  readonly pendingPicture = signal<File | null>(null);
  readonly isSigningOutEverywhere = signal<boolean>(false);
  readonly signOutEverywhereError = signal<string | null>(null);
  readonly displayName = computed(() => this.username() ?? this.email());

  readonly canSave = computed(() => {
    const candidate = this.usernameInput().trim();
    return USERNAME_PATTERN.test(candidate) && candidate !== this.username();
  });

  /** Set on the first blur, so the rule is not thrown at a name still being typed. */
  private readonly usernameWasLeft = signal<boolean>(false);

  /**
   * Only ever shown for a name that has been typed and left: an empty field is a name not filled
   * in yet, not a wrong one, and it already has nothing to save.
   */
  readonly usernameRuleBroken = computed(() => {
    const candidate = this.usernameInput().trim();
    return this.usernameWasLeft() && candidate.length > 0 && !USERNAME_PATTERN.test(candidate);
  });

  private readonly usernameField = viewChild<ElementRef<HTMLInputElement>>('usernameField');

  /**
   * The account menu links here to say a name has not been set yet, and lands on #username. The
   * field it means only exists once the account has loaded, so the fragment cannot just be
   * scrolled to on arrival: it is honoured when the field appears, and only the first time, so a
   * later render (a picture saved, say) does not pull the caret back.
   */
  private readonly fragment = toSignal(this.route.fragment);
  private focusedUsername = false;

  constructor() {
    effect(() => {
      const field = this.usernameField();
      if (!field || this.fragment() !== 'username' || this.focusedUsername) {
        return;
      }
      this.focusedUsername = true;
      field.nativeElement.focus();
    });
  }

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
      error: (error: unknown) => {
        this.isLoading.set(false);
        this.loadFailure.set(error);
        this.loadFailed.set(true);
      },
    });
  }

  onUsernameInput(event: Event): void {
    this.usernameInput.set((event.target as HTMLInputElement).value);
  }

  onUsernameBlur(): void {
    this.usernameWasLeft.set(true);
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
            ? 'That username is already taken. Choose another.'
            : messageForError(error, "Couldn't save your name."),
        );
      },
    });
  }

  /**
   * A picked file is not uploaded on the spot: it opens the crop dialog, and what that saves is
   * the square the user placed. The format is judged here rather than there, so a file no browser
   * will draw is named as such instead of opening a dialog on a picture that never appears.
   */
  onAvatarPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same file again after a failure fires another change event.
    input.value = '';
    if (!file) {
      return;
    }
    this.avatarError.set(null);
    if (!isAcceptedAvatarType(file)) {
      this.avatarError.set(UNSUPPORTED_FORMAT);
      return;
    }
    this.pendingPicture.set(file);
  }

  cancelPicture(): void {
    this.pendingPicture.set(null);
  }

  /** The dialog could not show the file, so it is not a picture whatever its type claimed. */
  reportUnreadablePicture(): void {
    this.pendingPicture.set(null);
    this.avatarError.set(UNREADABLE_FILE);
  }

  /**
   * Uploads the square the user placed. The dialog stays open while this runs and closes when it
   * lands: a failure that closed it would throw away the placing along with the error.
   */
  savePicture(crop: AvatarCrop): void {
    const file = this.pendingPicture();
    if (!file) {
      return;
    }
    this.isUploading.set(true);
    this.avatarError.set(null);
    from(this.avatarImages.prepare(file, crop))
      .pipe(switchMap((image) => this.account.setAvatar(image)))
      .subscribe({
        next: () => {
          this.isUploading.set(false);
          this.pendingPicture.set(null);
        },
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
      return UNSUPPORTED_FORMAT;
    }
    if (error instanceof UnreadableImageError) {
      return UNREADABLE_FILE;
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

  signOutEverywhere(): void {
    this.isSigningOutEverywhere.set(true);
    this.signOutEverywhereError.set(null);
    this.auth.signOutEverywhere().subscribe({
      error: (error: unknown) => {
        this.isSigningOutEverywhere.set(false);
        this.signOutEverywhereError.set(
          messageForError(error, "Couldn't sign you out everywhere. You're still signed in."),
        );
      },
    });
  }
}
