import { MockBuilder, MockRender } from 'ng-mocks';
import { GoogleSignInButtonComponent } from './google-sign-in-button';

describe('GoogleSignInButtonComponent', () => {
  beforeEach(() => MockBuilder(GoogleSignInButtonComponent));

  it('renders the button host when a client id is configured', () => {
    const fixture = MockRender(GoogleSignInButtonComponent);
    const host = fixture.point.nativeElement.querySelector('.google-button-host');

    expect(host).toBeTruthy();
  });
});
