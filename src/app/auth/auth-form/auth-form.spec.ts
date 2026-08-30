import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { RouterLink } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthFormComponent } from './auth-form';
import { AuthCredentials } from './model';
import { GoogleSignInButtonComponent } from '../google-sign-in-button/google-sign-in-button';
import { FacebookSignInButtonComponent } from '../facebook-sign-in-button/facebook-sign-in-button';
import { PasswordRequirementsComponent } from '../password-requirements/password-requirements';
import { environment } from '../../../environments/environment';

describe('AuthFormComponent', () => {
  beforeEach(() => MockBuilder(AuthFormComponent));

  const render = (isLoading: boolean) =>
    MockRender(AuthFormComponent, {
      title: 'Sign In',
      subtitle: 'Welcome back',
      submitLabel: 'Sign In',
      loadingLabel: 'Signing in',
      footerText: "Don't have an account?",
      footerLinkLabel: 'Register',
      footerLinkRoute: '/register',
      isLoading,
    });

  const renderRegister = () =>
    MockRender(AuthFormComponent, {
      title: 'Create Account',
      subtitle: 'Join Fantasy Hockey today',
      submitLabel: 'Create Account',
      loadingLabel: 'Creating account',
      footerText: 'Already have an account?',
      footerLinkLabel: 'Sign in',
      footerLinkRoute: '/login',
      enforcePasswordPolicy: true,
      requireConfirmPassword: true,
      isLoading: false,
    });

  /**
   * Where a visitor was headed rides on the URL as ?returnUrl=, and changing their mind about
   * which form they wanted should not lose it. AuthService forgets a return URL it is not handed
   * on arrival, so this link is what carries it across.
   */
  it('keeps the query string when switching to the other form', () => {
    render(false);

    const link = ngMocks.get(ngMocks.find('.auth-footer a'), RouterLink);
    expect(link.routerLink).toEqual('/register');
    expect(link.queryParamsHandling).toEqual('preserve');
  });

  it('shows the submit label and stays enabled when not loading', () => {
    render(false);
    const button = ngMocks.find('button.btn-primary').nativeElement as HTMLButtonElement;

    expect(button.disabled).toEqual(false);
    expect(button.textContent).toContain('Sign In');
    expect(ngMocks.findAll('.loading-dots')).toHaveLength(0);
  });

  it('shows the loading label with an animated dots element and disables the button while loading', () => {
    render(true);
    const button = ngMocks.find('button.btn-primary').nativeElement as HTMLButtonElement;

    expect(button.disabled).toEqual(true);
    expect(button.textContent).toContain('Signing in');
    expect(ngMocks.findAll('.loading-dots')).toHaveLength(1);
  });

  it('renders the Google sign-in button and a divider when a client id is configured', () => {
    render(false);

    expect(ngMocks.findAll('.auth-divider')).toHaveLength(1);
    expect(ngMocks.findAll(GoogleSignInButtonComponent)).toHaveLength(1);
  });

  it('re-emits the Google button login as googleLogin', () => {
    const fixture = render(false);
    const googleButton = ngMocks.find(GoogleSignInButtonComponent);

    let emitted = false;
    fixture.point.componentInstance.googleLogin.subscribe(() => (emitted = true));
    ngMocks.output(googleButton, 'login').emit();

    expect(emitted).toEqual(true);
  });

  it('does not render the confirm-password field on the login form', () => {
    const fixture = render(false);

    expect(fixture.nativeElement.querySelector('#confirmPassword')).toBeNull();
  });

  it('renders the confirm-password field when required', () => {
    const fixture = renderRegister();

    expect(fixture.nativeElement.querySelector('#confirmPassword')).not.toBeNull();
  });

  it('shows an error when the confirmation does not match', () => {
    const fixture = renderRegister();
    const component = fixture.point.componentInstance;

    component.authForm.password().value.set('Password1');
    component.authForm.confirmPassword().value.set('Different1');
    component.authForm.confirmPassword().markAsTouched();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Passwords do not match');
  });

  it('emits only email and password (not the confirmation) when they match', async () => {
    const fixture = renderRegister();
    const component = fixture.point.componentInstance;

    component.authForm.email().value.set('manager@example.com');
    component.authForm.password().value.set('Password1');
    component.authForm.confirmPassword().value.set('Password1');
    fixture.detectChanges();

    let emitted: AuthCredentials | undefined;
    component.formSubmit.subscribe((value: AuthCredentials) => {
      emitted = value;
    });
    component.onSubmit(new Event('submit'));
    await fixture.whenStable();

    expect(emitted).toEqual({ email: 'manager@example.com', password: 'Password1' });
  });

  it('shows the password requirements checklist on the register form', () => {
    renderRegister();

    expect(ngMocks.findAll(PasswordRequirementsComponent)).toHaveLength(1);
  });

  it('does not show the password requirements checklist on the login form', () => {
    render(false);

    expect(ngMocks.findAll(PasswordRequirementsComponent)).toHaveLength(0);
  });

  it('does not submit when the password does not meet the policy', async () => {
    const fixture = renderRegister();
    const component = fixture.point.componentInstance;

    component.authForm.email().value.set('manager@example.com');
    // Eight lowercase letters: satisfies length but misses the uppercase and number rules.
    component.authForm.password().value.set('weakpass');
    component.authForm.confirmPassword().value.set('weakpass');
    fixture.detectChanges();

    let emitted: AuthCredentials | undefined;
    component.formSubmit.subscribe((value: AuthCredentials) => {
      emitted = value;
    });
    component.onSubmit(new Event('submit'));
    await fixture.whenStable();

    expect(emitted).toBeUndefined();
  });
});

describe('AuthFormComponent Facebook button visibility', () => {
  const originalFacebookAppId = environment.facebookAppId;
  const originalFacebookLoginEnabled = environment.facebookLoginEnabled;

  beforeEach(() => MockBuilder(AuthFormComponent));

  afterEach(() => {
    environment.facebookAppId = originalFacebookAppId;
    environment.facebookLoginEnabled = originalFacebookLoginEnabled;
  });

  const renderLogin = () =>
    MockRender(AuthFormComponent, {
      title: 'Sign In',
      subtitle: 'Welcome back',
      submitLabel: 'Sign In',
      loadingLabel: 'Signing in',
      footerText: "Don't have an account?",
      footerLinkLabel: 'Register',
      footerLinkRoute: '/register',
      isLoading: false,
    });

  it('renders the Facebook button when an app id is set and the toggle is enabled', () => {
    environment.facebookAppId = 'test-facebook-app-id';
    environment.facebookLoginEnabled = true;

    renderLogin();

    expect(ngMocks.findAll(FacebookSignInButtonComponent)).toHaveLength(1);
  });

  it('hides the Facebook button when the toggle is disabled even if an app id is set', () => {
    environment.facebookAppId = 'test-facebook-app-id';
    environment.facebookLoginEnabled = false;

    renderLogin();

    expect(ngMocks.findAll(FacebookSignInButtonComponent)).toHaveLength(0);
  });
});
