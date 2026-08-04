import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { AuthFormComponent } from '../auth-form/auth-form';
import { AuthCredentials } from '../auth-form/model';
import { messageForError } from '../../shared/http-error';

@Component({
  selector: 'app-login',
  imports: [AuthFormComponent],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);

  onSubmit(credentials: AuthCredentials) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.login(credentials).subscribe({
      error: (error: unknown) => {
        this.errorMessage.set(
          messageForError(error, 'Invalid email or password. Please try again.'),
        );
        this.isLoading.set(false);
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

    this.authService.facebookLogin(accessToken).subscribe({
      error: (error: unknown) => {
        this.errorMessage.set(messageForError(error, 'Facebook sign-in failed. Please try again.'));
        this.isLoading.set(false);
      },
    });
  }
}
