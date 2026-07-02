import { MockBuilder, MockRender } from 'ng-mocks';
import { FacebookSignInButtonComponent } from './facebook-sign-in-button';

describe('FacebookSignInButtonComponent', () => {
  beforeEach(() => MockBuilder(FacebookSignInButtonComponent));

  it('does not render the button until a Facebook App ID is configured', () => {
    const fixture = MockRender(FacebookSignInButtonComponent);
    const button = fixture.point.nativeElement.querySelector('.fb-sign-in-btn');

    expect(button).toBeNull();
  });
});
