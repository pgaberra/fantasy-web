import { Component, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormField, email, form, minLength, required, schema, submit } from '@angular/forms/signals';
import { AuthCredentials } from './model';

@Component({
  selector: 'app-auth-form',
  imports: [FormField, RouterLink],
  templateUrl: './auth-form.html',
  styleUrl: './auth-form.css',
})
export class AuthFormComponent {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly submitLabel = input.required<string>();
  readonly loadingLabel = input.required<string>();
  readonly footerText = input.required<string>();
  readonly footerLinkLabel = input.required<string>();
  readonly footerLinkRoute = input.required<string>();
  readonly passwordMinLength = input<number | undefined>(undefined);
  readonly errorMessage = input<string | null>(null);
  readonly isLoading = input(false);

  readonly formSubmit = output<AuthCredentials>();

  private readonly authFormModel = signal<AuthCredentials>({ email: '', password: '' });

  readonly authForm = form(this.authFormModel, schema(fields => {
    required(fields.email, { message: 'Email is required.' });
    email(fields.email, { message: 'Enter a valid email address.' });
    required(fields.password, { message: 'Password is required.' });
    minLength(fields.password, () => this.passwordMinLength(), {
      message: 'Password must be at least 8 characters.',
    });
  }));

  async handleSubmit(event: Event) {
    event.preventDefault();
    const isValid = await submit(this.authForm);
    if (isValid) {
      this.formSubmit.emit(this.authFormModel());
    }
  }
}
