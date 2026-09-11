import { signal } from '@angular/core';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { SiteFooterComponent } from './site-footer';

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

  // Paddle wants the refund policy reachable from the navigation, and it has a page of its own.
  it.each([true, false])('links the refund policy while signed in is %s', async (loggedIn) => {
    await render(loggedIn);

    const link = ngMocks
      .findAll('.site-footer-links a')
      .find((anchor) => (anchor.nativeElement as HTMLElement).textContent?.trim() === 'Refunds');
    if (!link) {
      throw new Error('The footer has no Refunds link');
    }
    expect(ngMocks.input(link, 'routerLink')).toEqual('/refunds');
  });
});
