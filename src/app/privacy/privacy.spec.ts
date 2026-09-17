import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { PrivacyComponent } from './privacy';

function text(): string {
  // Whitespace collapsed, so a phrase checked here survives Prettier rewrapping the template.
  return ((ngMocks.find('.privacy').nativeElement as HTMLElement).textContent ?? '').replace(
    /\s+/g,
    ' ',
  );
}

describe('PrivacyComponent', () => {
  it('renders the policy', async () => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(ngMocks.findAll('.privacy__title').length).toEqual(1);
  });

  // GDPR requires the controller to be identified with contact details. Both are the whole
  // point of the page for anyone trying to exercise a right, so pin them.
  it('names the controller and a way to reach them', async () => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain('Alexander Berglund');
    expect(text()).toContain('privacy@slapstat.com');
  });

  // Every party named here is one the code really sends data to, or that the user really
  // connects. If one is added or dropped, this test should fail and force the page to change
  // with it — a privacy policy that has drifted from the code is worse than none.
  it.each(['Stripe', 'PostHog', 'Yahoo', 'ESPN', 'Google', 'Facebook'])(
    'names %s as a party that receives data',
    async (name) => {
      await MockBuilder(PrivacyComponent);
      MockRender(PrivacyComponent);

      expect(text()).toContain(name);
    },
  );

  it.each([
    // The consent gate is the one promise a visitor can check for themselves, and the one the
    // consent banner is built around: declining must mean no analytics cookie at all.
    {
      promise: 'states that analytics happen only with consent',
      phrase: 'If you do not consent, we do not set analytics cookies',
    },
    // Yahoo tokens are the most sensitive thing stored, and there is still no disconnect button
    // in the app, so the page has to say how to get them removed. Revisit the day one ships.
    {
      promise: 'says how to have the stored Yahoo connection removed',
      phrase: 'removal of the stored Yahoo connection',
    },
    // ESPN cookies are credentials to someone's ESPN account, stored for them, with no delete
    // button either.
    {
      promise: 'says ESPN cookies are stored encrypted, and how to have them removed',
      phrase: 'we store them encrypted',
    },
    // Sharing makes a projection and the username on it public; that is the one thing on this page
    // other people can see.
    {
      promise: 'says a shared projection is visible with its username',
      phrase: 'anyone with the link can see it, together with your username',
    },
    // There is no delete button, so the page must not describe one.
    {
      promise: 'does not promise a self-service account deletion',
      phrase: 'If you ask us to delete your account',
    },
    {
      promise: 'does not sell personal data or use it for advertising',
      phrase: 'We do not sell your personal data',
    },
    {
      promise: 'points at the Swedish supervisory authority',
      phrase: 'Integritetsskyddsmyndigheten',
    },
  ])('$promise', async ({ phrase }) => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain(phrase);
  });

  // Hosting, analytics and error monitoring sit in the EU; email delivery and payments do not.
  // The transfer basis is a required disclosure, not decoration.
  it('discloses transfers outside the EEA and their basis', async () => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain('outside the European Economic Area');
    expect(text()).toContain('standard contractual clauses');
  });
});
