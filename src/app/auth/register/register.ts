import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { AuthFormComponent } from '../auth-form/auth-form';
import { AuthCredentials } from '../auth-form/model';

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

  onSubmit(credentials: AuthCredentials) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.register(credentials).subscribe({
      error: () => {
        this.errorMessage.set('Registration failed.');
        this.isLoading.set(false);
      },
    });
  }

  onGoogleSubmit(idToken: string) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.googleLogin(idToken).subscribe({
      error: () => {
        this.errorMessage.set('Google sign-in failed. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  onFacebookSubmit(accessToken: string) {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.facebookLogin(accessToken).subscribe({
      error: () => {
        this.errorMessage.set('Facebook sign-in failed. Please try again.');
        this.isLoading.set(false);
      },
    });
  }
}
