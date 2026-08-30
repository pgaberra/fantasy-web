import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AccountService } from '../services/account.service';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { ErrorStateComponent } from '../shared/error-state/error-state';
import { USERNAME_MAX_LENGTH, USERNAME_PATTERN, USERNAME_RULE } from '../models/username';
import { messageForError } from '../shared/http-error';

/**
 * The account's public name. Sharing forces the choice, but it has to be changeable somewhere
 * afterwards — a shared page credits the current name, so this is what a reader sees.
 */
@Component({
  selector: 'app-profile',
  imports: [LoadingIndicatorComponent, ErrorStateComponent],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent implements OnInit {
  private readonly account = inject(AccountService);

  readonly usernameMaxLength = USERNAME_MAX_LENGTH;
  readonly usernameRule = USERNAME_RULE;

  readonly isLoading = signal<boolean>(true);
  readonly loadFailed = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly email = signal<string>('');
  readonly username = signal<string | null>(null);
  readonly usernameInput = signal<string>('');
  readonly errorMessage = signal<string | null>(null);
  readonly justSaved = signal<boolean>(false);

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
}
