import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ResetPasswordComponent } from './reset-password';
import { AuthService } from '../../services/auth.service';

const resetPassword = vi.fn(() => of<void>(undefined));

function setup(token: string) {
  resetPassword.mockClear();
  return MockBuilder(ResetPasswordComponent)
    .provide({ provide: AuthService, useValue: { resetPassword } })
    .provide({
      provide: ActivatedRoute,
      useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
    });
}

describe('ResetPasswordComponent', () => {
  it('shows the form when a token is present', async () => {
    await setup('reset-token');
    MockRender(ResetPasswordComponent);
    const heading = ngMocks.find('.auth-title').nativeElement as HTMLElement;
    expect(heading.textContent).toContain('Set a new password');
  });

  it('shows an invalid-link message when the token is missing', async () => {
    await setup('');
    MockRender(ResetPasswordComponent);
    const heading = ngMocks.find('.auth-title').nativeElement as HTMLElement;
    expect(heading.textContent).toContain('Invalid link');
  });

  it('resets the password and shows the success state', async () => {
    await setup('reset-token');
    const fixture = MockRender(ResetPasswordComponent);
    const component = fixture.point.componentInstance;

    component.resetForm.password().value.set('Newsecret1');
    component.resetForm.confirmPassword().value.set('Newsecret1');
    fixture.detectChanges();
    component.onSubmit(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(resetPassword).toHaveBeenCalledWith('reset-token', 'Newsecret1');
    expect(component.succeeded()).toEqual(true);
  });

  it('does not reset when passwords do not match', async () => {
    await setup('reset-token');
    const fixture = MockRender(ResetPasswordComponent);
    const component = fixture.point.componentInstance;

    component.resetForm.password().value.set('Newsecret1');
    component.resetForm.confirmPassword().value.set('Different1');
    fixture.detectChanges();
    component.onSubmit(new Event('submit'));
    await fixture.whenStable();

    expect(resetPassword).not.toHaveBeenCalled();
    expect(component.succeeded()).toEqual(false);
  });

  it('does not reset when the password does not meet the policy', async () => {
    await setup('reset-token');
    const fixture = MockRender(ResetPasswordComponent);
    const component = fixture.point.componentInstance;

    // Matching confirmation, but the password misses the uppercase and number rules.
    component.resetForm.password().value.set('weakpass');
    component.resetForm.confirmPassword().value.set('weakpass');
    fixture.detectChanges();
    component.onSubmit(new Event('submit'));
    await fixture.whenStable();

    expect(resetPassword).not.toHaveBeenCalled();
    expect(component.succeeded()).toEqual(false);
  });
});
