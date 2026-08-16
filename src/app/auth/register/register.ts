import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AuthFormComponent } from '../auth-form/auth-form';
import { AuthCredentials } from '../auth-form/model';
import { messageForError } from '../../shared/http-error';

@Component({
  selector: 'app-register',
  imports: [AuthFormComponent],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);

  /**
   * `finalize` rather than resetting only on the error path: a success used to leave the flag set
   * forever, on the assumption that the navigation in `storeTokens` would tear the form down. When
   * that navigation failed — a tab open across a deploy, asking for chunks that no longer exist —
   * the account had been created, the user was signed in, and the button span on saying "Creating
   * account…" with nothing to click and nothing said.
   */
  onSubmit(credentials: AuthCredentials) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService
      .register(credentials)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        error: (error: unknown) => {
          this.errorMessage.set(
            messageForError(error, 'Registration failed. Please check your details and try again.'),
          );
        },
      });
  }

  onGoogleLogin() {
    this.errorMessage.set(null);
    // Navigates away to Google; completion is handled by GoogleCallbackComponent on return.
    this.authService.startGoogleRedirect();
  }

  onFacebookSubmit(accessToken: string) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService
      .facebookLogin(accessToken)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        error: (error: unknown) => {
          this.errorMessage.set(
            messageForError(error, 'Facebook sign-in failed. Please try again.'),
          );
        },
      });
  }
}
