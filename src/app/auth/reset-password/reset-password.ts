import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormField,
  form,
  maxLength,
  required,
  schema,
  submit,
  validate,
} from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { PasswordRequirementsComponent } from '../password-requirements/password-requirements';
import { PASSWORD_MAX_LENGTH, unmetPasswordRequirements } from '../password-policy';

interface ResetFormValue {
  password: string;
  confirmPassword: string;
}

@Component({
  selector: 'app-reset-password',
  imports: [FormField, RouterLink, PasswordRequirementsComponent],
  templateUrl: './reset-password.html',
  styleUrl: '../auth-page.css',
})
export class ResetPasswordComponent {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  readonly hasToken = this.token.length > 0;

  readonly errorMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly succeeded = signal(false);

  private readonly model = signal<ResetFormValue>({ password: '', confirmPassword: '' });

  readonly resetForm = form(
    this.model,
    schema((fields) => {
      required(fields.password, { message: 'Password is required.' });
      maxLength(fields.password, PASSWORD_MAX_LENGTH, {
        message: 'Password must be at most 72 characters.',
      });
      validate(fields.password, (ctx) => {
        if (unmetPasswordRequirements(ctx.value()).length > 0) {
          return {
            kind: 'weakPassword',
            message: 'Password does not meet the requirements.',
          };
        }
        return undefined;
      });
      validate(fields.confirmPassword, (ctx) => {
        if (ctx.value().length === 0) {
          return { kind: 'required', message: 'Please confirm your password.' };
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
    void submit(this.resetForm, async () => {
      this.isLoading.set(true);
      this.errorMessage.set(null);
      try {
        await firstValueFrom(this.authService.resetPassword(this.token, this.model().password));
        this.succeeded.set(true);
      } catch {
        this.errorMessage.set('This reset link is invalid or has expired. Request a new one.');
      } finally {
        this.isLoading.set(false);
      }
    });
  }
}
