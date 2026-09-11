import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { messageForError } from '../../shared/http-error';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';

/**
 * Lands the Google OAuth redirect (`/auth/google/callback?code=…&state=…`). It hands the code
 * and state to {@link AuthService.completeGoogleLogin}, which validates the state and exchanges
 * the code via the BFF. On success AuthService stores the tokens and navigates to /projections;
 * on failure (or a cancelled/denied redirect) we show an inline message with a way back.
 */
@Component({
  selector: 'app-google-callback',
  imports: [RouterLink, LoadingIndicatorComponent],
  templateUrl: './google-callback.html',
  styleUrl: '../auth-page.css',
})
export class GoogleCallbackComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly errorMessage = signal<string | null>(null);

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const state = params.get('state');
    const errorParam = params.get('error');

    if (errorParam || !code || !state) {
      // Google appends ?error=access_denied when the user cancels the consent screen.
      this.errorMessage.set(
        errorParam === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in failed.',
      );
      return;
    }

    this.authService.completeGoogleLogin(code, state).subscribe({
      error: (error: unknown) =>
        this.errorMessage.set(messageForError(error, 'Google sign-in failed.')),
    });
  }
}
