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

  // Every party named here is one the code really sends data to, or that the browser really
  // contacts. If one is added or dropped, this test should fail and force the page to change
  // with it — a privacy policy that has drifted from the code is worse than none.
  it.each([
    'Cloudflare',
    'Gmail',
    'Paddle',
    'Hetzner',
    'PostHog',
    'Resend',
    'Sentry',
    'Google Fonts',
    'Yahoo',
  ])('names %s as a recipient of data', async (name) => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain(name);
  });

  // index.html loads Inter from fonts.googleapis.com on every page, so Google sees every
  // visitor's IP with no consent gate. It's the least visible disclosure on the site and the
  // easiest to forget — pin it.
  it('discloses that the browser contacts third parties directly', async () => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain('receive your IP address');
  });

  // There is genuinely no account-deletion endpoint in the codebase, so the policy must not
  // imply one. Delete this test the day a delete button ships — and update the page with it.
  it('is honest that account deletion is not self-service', async () => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain('no self-service delete or export button');
  });

  it('points at the Swedish supervisory authority', async () => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain('Integritetsskyddsmyndigheten');
  });

  // GDPR requires the controller to be identified with contact details. Both are the whole
  // point of the page for anyone trying to exercise a right, so pin them.
  it('names the controller and a way to reach them', async () => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain('Alexander Berglund');
    expect(text()).toContain('privacy@slapstat.com');
  });

  // Resend is the one processor outside the EU, so the transfer has to be disclosed rather
  // than buried in a table cell.
  it('discloses that email delivery leaves the EU', async () => {
    await MockBuilder(PrivacyComponent);
    MockRender(PrivacyComponent);

    expect(text()).toContain('leaves the EU');
  });
});
