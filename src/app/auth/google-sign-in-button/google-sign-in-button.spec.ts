import { MockBuilder, MockRender } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { GoogleSignInButtonComponent } from './google-sign-in-button';

describe('GoogleSignInButtonComponent', () => {
  beforeEach(() => MockBuilder(GoogleSignInButtonComponent));

  it('renders the Google button when a client id is configured', () => {
    const fixture = MockRender(GoogleSignInButtonComponent);
    const button = fixture.point.nativeElement.querySelector('.google-btn') as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Continue with Google');
  });

  it('emits login when the button is clicked', () => {
    const fixture = MockRender(GoogleSignInButtonComponent);
    let emitted = false;
    fixture.point.componentInstance.login.subscribe(() => (emitted = true));

    (fixture.point.nativeElement.querySelector('.google-btn') as HTMLButtonElement).click();

    expect(emitted).toEqual(true);
  });
});
