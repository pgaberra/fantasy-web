import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { PrivacyComponent } from './privacy';

function text(): string {
  return (ngMocks.find('.privacy').nativeElement as HTMLElement).textContent ?? '';
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
  it.each(['Paddle', 'PostHog', 'Yahoo', 'Google', 'Facebook'])(
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
      name: 'states that analytics happen only with consent',
      says: 'If you do not consent, we do not set analytics cookies',
    },
    // Yahoo tokens are the most sensitive thing stored, and there is still no disconnect button
    // in the app, so the page has to say how to get them removed. Revisit the day one ships.
    {
      name: 'says how to have the stored Yahoo connection removed',
      says: 'removal of the stored Yahoo connection',
    },
    {
      name: 'does not sell personal data or use it for advertising',
      says: 'We do not sell your personal data',
    },
    {
      name: 'points at the Swedish supervisory authority',
      says: 'Integritetsskyddsmyndigheten',
    },
  ])('$name', async ({ says }) => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain(says);
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
