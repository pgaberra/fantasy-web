import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FormField,
  email,
  form,
  maxLength,
  required,
  schema,
  submit,
} from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

const EMAIL_MAX_LENGTH = 254;

@Component({
  selector: 'app-forgot-password',
  imports: [FormField, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: '../auth-page.css',
})
export class ForgotPasswordComponent {
  private readonly authService = inject(AuthService);

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly submitted = signal(false);

  private readonly model = signal({ email: '' });

  readonly forgotForm = form(
    this.model,
    schema((fields) => {
      required(fields.email, { message: 'Email is required.' });
      email(fields.email, { message: 'Enter a valid email address.' });
      maxLength(fields.email, EMAIL_MAX_LENGTH, { message: 'Email is too long.' });
    }),
  );

  onSubmit(event: Event) {
    event.preventDefault();
    void submit(this.forgotForm, async () => {
      this.isLoading.set(true);
      this.errorMessage.set(null);
      try {
        await firstValueFrom(this.authService.forgotPassword(this.model().email));
        this.submitted.set(true);
      } catch {
        this.errorMessage.set('Something went wrong. Try again.');
      } finally {
        this.isLoading.set(false);
      }
    });
  }
}
