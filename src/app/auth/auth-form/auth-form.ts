import { Component, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FormField,
  email,
  form,
  maxLength,
  minLength,
  required,
  schema,
  submit,
} from '@angular/forms/signals';
import { AuthCredentials } from './model';

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MAX_LENGTH = 72;

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

  readonly authForm = form(
    this.authFormModel,
    schema((fields) => {
      required(fields.email, { message: 'Email is required.' });
      email(fields.email, { message: 'Enter a valid email address.' });
      maxLength(fields.email, EMAIL_MAX_LENGTH, { message: 'Email is too long.' });
      required(fields.password, { message: 'Password is required.' });
      minLength(fields.password, () => this.passwordMinLength(), {
        message: 'Password must be at least 8 characters.',
      });
      maxLength(fields.password, PASSWORD_MAX_LENGTH, {
        message: 'Password must be at most 72 characters.',
      });
    }),
  );

  onSubmit(event: Event) {
    event.preventDefault();
    void submit(this.authForm, async () => {
      this.formSubmit.emit(this.authFormModel());
    });
  }
}
