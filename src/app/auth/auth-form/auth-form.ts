import { Component, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FormField,
  email,
  form,
  maxLength,
  required,
  schema,
  submit,
  validate,
} from '@angular/forms/signals';
import { AuthCredentials } from './model';
import { GoogleSignInButtonComponent } from '../google-sign-in-button/google-sign-in-button';
import { FacebookSignInButtonComponent } from '../facebook-sign-in-button/facebook-sign-in-button';
import { PasswordRequirementsComponent } from '../password-requirements/password-requirements';
import { PASSWORD_MAX_LENGTH, unmetPasswordRequirements } from '../password-policy';
import { environment } from '../../../environments/environment';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';

const EMAIL_MAX_LENGTH = 254;

interface AuthFormValue extends AuthCredentials {
  confirmPassword: string;
}

@Component({
  selector: 'app-auth-form',
  imports: [
    FormField,
    RouterLink,
    GoogleSignInButtonComponent,
    FacebookSignInButtonComponent,
    PasswordRequirementsComponent,
    LoadingIndicatorComponent,
  ],
  templateUrl: './auth-form.html',
  styleUrl: './auth-form.css',
})
export class AuthFormComponent {
  readonly googleEnabled = !!environment.googleClientId;
  readonly facebookEnabled = !!environment.facebookAppId && environment.facebookLoginEnabled;

  readonly title = input.required<string>();
  /** Optional: a form whose title already says what it is for passes none, and no line renders. */
  readonly subtitle = input<string>();
  readonly submitLabel = input.required<string>();
  readonly loadingLabel = input.required<string>();
  readonly footerText = input.required<string>();
  readonly footerLinkLabel = input.required<string>();
  readonly footerLinkRoute = input.required<string>();
  readonly enforcePasswordPolicy = input(false);
  readonly requireConfirmPassword = input(false);
  readonly showForgotPasswordLink = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly isLoading = input(false);

  readonly formSubmit = output<AuthCredentials>();
  readonly googleLogin = output<void>();
  readonly facebookSubmit = output<string>();

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
      maxLength(fields.password, PASSWORD_MAX_LENGTH, {
        message: 'Password must be at most 72 characters.',
      });
      validate(fields.password, (ctx) => {
        if (!this.enforcePasswordPolicy()) {
          return undefined;
        }
        if (unmetPasswordRequirements(ctx.value()).length > 0) {
          return {
            kind: 'weakPassword',
            message: 'Password does not meet the requirements.',
          };
        }
        return undefined;
      });
      validate(fields.confirmPassword, (ctx) => {
        if (!this.requireConfirmPassword()) {
          return undefined;
        }
        if (ctx.value().length === 0) {
          return { kind: 'required', message: 'Confirm your password.' };
        }
        if (ctx.value() !== ctx.valueOf(fields.password)) {
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
