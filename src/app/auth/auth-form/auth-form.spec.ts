import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { AuthFormComponent } from './auth-form';

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
});
