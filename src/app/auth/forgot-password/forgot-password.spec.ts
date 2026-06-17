import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordComponent } from './forgot-password';
import { AuthService } from '../../services/auth.service';

describe('ForgotPasswordComponent', () => {
  const forgotPassword = vi.fn(() => of<void>(undefined));

  beforeEach(() => {
    forgotPassword.mockClear();
    return MockBuilder(ForgotPasswordComponent).provide({
      provide: AuthService,
      useValue: { forgotPassword },
    });
  });

  it('renders the forgot-password heading', () => {
    MockRender(ForgotPasswordComponent);
    const heading = ngMocks.find('.auth-title').nativeElement as HTMLElement;
    expect(heading.textContent).toContain('Forgot password?');
  });

  it('sends a reset link for a valid email and shows the confirmation', async () => {
    const fixture = MockRender(ForgotPasswordComponent);
    const component = fixture.point.componentInstance;

    component.forgotForm.email().value.set('manager@example.com');
    fixture.detectChanges();
    component.onSubmit(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(forgotPassword).toHaveBeenCalledWith('manager@example.com');
    expect(component.submitted()).toEqual(true);
  });

  it('does not send for an invalid email', async () => {
    const fixture = MockRender(ForgotPasswordComponent);
    const component = fixture.point.componentInstance;

    component.forgotForm.email().value.set('not-an-email');
    fixture.detectChanges();
    component.onSubmit(new Event('submit'));
    await fixture.whenStable();

    expect(forgotPassword).not.toHaveBeenCalled();
    expect(component.submitted()).toEqual(false);
  });
});
