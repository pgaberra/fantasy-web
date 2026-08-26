import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
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
export class LoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);

  /**
   * Handed to AuthService rather than kept here: the visitor may still switch between Sign
   * in and Register, or leave for Google and come back, and where they were headed should
   * survive all of it.
   */
  ngOnInit(): void {
    this.authService.rememberReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  }

  onSubmit(credentials: AuthCredentials) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    // See the note in RegisterComponent: resetting only on the error path leaves the form spinning
    // forever whenever the post-sign-in navigation fails rather than the sign-in itself.
    this.authService
      .login(credentials)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        error: (error: unknown) => {
          this.errorMessage.set(
            messageForError(error, 'Invalid email or password. Please try again.'),
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
