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
    expect(contact.textContent?.trim()).toEqual('Contact');
  });
});
