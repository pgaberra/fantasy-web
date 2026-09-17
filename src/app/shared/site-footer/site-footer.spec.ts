import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { SiteFooterComponent } from './site-footer';

describe('SiteFooterComponent', () => {
  const render = async (loggedIn: boolean, url = '/draft?league=12') => {
    await MockBuilder(SiteFooterComponent)
      .mock(AuthService, { isLoggedIn: signal(loggedIn) })
      .mock(Router, { events: EMPTY, url });
    return MockRender(SiteFooterComponent);
  };

  const feedbackLink = () =>
    ngMocks
      .findAll('.site-footer-links a')
      .find(
        (anchor) => (anchor.nativeElement as HTMLElement).textContent?.trim() === 'Send Feedback',
      );

  // Only an account can be answered, so the form is for signed-in readers.
  it.each([
    { loggedIn: true, shown: true },
    { loggedIn: false, shown: false },
  ])('links the feedback form: signed in $loggedIn', async ({ loggedIn, shown }) => {
    await render(loggedIn);

    expect(feedbackLink() !== undefined).toEqual(shown);
  });

  // The query string is dropped: a reset or verification link carries its token there.
  it('tells the form which page the reader was on, without its query string', async () => {
    await render(true, '/reset-password?token=live');

    const link = feedbackLink();
    if (!link) {
      throw new Error('The footer has no feedback link');
    }
    expect(ngMocks.input(link, 'routerLink')).toEqual('/feedback');
    expect(ngMocks.input(link, 'queryParams')).toEqual({ from: '/reset-password' });
  });

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

  // The refund policy is part of the terms, and the footer's Terms link is the way to it. A
  // separate Refunds link was taken out at Alexander's request.
  it.each([true, false])('has no separate Refunds link while signed in is %s', async (loggedIn) => {
    await render(loggedIn);

    const labels = ngMocks
      .findAll('.site-footer-links a')
      .map((anchor) => (anchor.nativeElement as HTMLElement).textContent?.trim());
    expect(labels).toContain('Terms');
    expect(labels).not.toContain('Refunds');
  });
});
