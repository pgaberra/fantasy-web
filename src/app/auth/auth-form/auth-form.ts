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
  validate,
} from '@angular/forms/signals';
import { AuthCredentials } from './model';
import { GoogleSignInButtonComponent } from '../google-sign-in-button/google-sign-in-button';
import { environment } from '../../../environments/environment';

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MAX_LENGTH = 72;

interface AuthFormValue extends AuthCredentials {
  confirmPassword: string;
}

@Component({
  selector: 'app-auth-form',
  imports: [FormField, RouterLink, GoogleSignInButtonComponent],
  templateUrl: './auth-form.html',
  styleUrl: './auth-form.css',
})
export class AuthFormComponent {
  readonly googleEnabled = !!environment.googleClientId;

  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly submitLabel = input.required<string>();
  readonly loadingLabel = input.required<string>();
  readonly footerText = input.required<string>();
  readonly footerLinkLabel = input.required<string>();
  readonly footerLinkRoute = input.required<string>();
  readonly passwordMinLength = input<number | undefined>(undefined);
  readonly requireConfirmPassword = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly isLoading = input(false);

  readonly formSubmit = output<AuthCredentials>();
  readonly googleSubmit = output<string>();

  private readonly authFormModel = signal<AuthFormValue>({
    email: '',
    password: '',
    confirmPassword: '',
  });

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
      validate(fields.confirmPassword, ({ value, valueOf }) => {
        if (!this.requireConfirmPassword()) {
          return undefined;
        }
        if (value().length === 0) {
          return { kind: 'required', message: 'Please confirm your password.' };
        }
        if (value() !== valueOf(fields.password)) {
          return { kind: 'passwordMismatch', message: 'Passwords do not match.' };
        }
        return undefined;
      });
    }),
  );

  onSubmit(event: Event) {
    event.preventDefault();
    void submit(this.authForm, async () => {
      const { email: emailValue, password } = this.authFormModel();
      this.formSubmit.emit({ email: emailValue, password });
    });
  }
}
