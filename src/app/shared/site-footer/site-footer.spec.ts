import { signal } from '@angular/core';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { SiteFooterComponent } from './site-footer';
import { environment } from '../../../environments/environment';

describe('SiteFooterComponent', () => {
  const render = async (loggedIn: boolean) => {
    await MockBuilder(SiteFooterComponent).mock(AuthService, { isLoggedIn: signal(loggedIn) });
    return MockRender(SiteFooterComponent);
  };

  // The footer is the only place in the app that offers a way to reach us, and half the
  // people who need one are signed out (they cannot get in) while the other half are signed
  // in (something is wrong once they are). Both states have to show it.
  it.each([true, false])('offers a contact address while signed in is %s', async (loggedIn) => {
    await render(loggedIn);

    const contact = ngMocks.find('.site-footer-links a[href^="mailto:"]')
      .nativeElement as HTMLAnchorElement;
    expect(contact.getAttribute('href')).toEqual('mailto:info@slapstat.com');
    // The address is the link text, not a word like "Contact" standing in for it. Someone who
    // wants to write from their phone, or note it down for later, should be able to read it
    // off the page without clicking anything.
    expect(contact.textContent?.trim()).toEqual('info@slapstat.com');
  });

  // The price has to be reachable from the navigation, signed in or out, wherever a build sells
  // something: Paddle's review checks for it, and a visitor weighing the app up needs it. Where
  // nothing is for sale the pricing page redirects home, so the link goes with it.
  it.each([true, false])(
    'links to pricing only where payments are on, while signed in is %s',
    async (loggedIn) => {
      const original = environment.paymentsEnabled;
      try {
        environment.paymentsEnabled = true;
        await render(loggedIn);
        expect(ngMocks.find('.site-footer-links a[routerLink="/pricing"]')).toBeTruthy();
        ngMocks.flushTestBed();

        environment.paymentsEnabled = false;
        await render(loggedIn);
        expect(ngMocks.findAll('.site-footer-links a[routerLink="/pricing"]').length).toEqual(0);
      } finally {
        environment.paymentsEnabled = original;
      }
    },
  );
});
