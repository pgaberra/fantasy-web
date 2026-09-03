import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { of } from 'rxjs';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { App } from './app';
import { environment } from '../environments/environment';
import { AccountService } from './services/account.service';
import { AuthService } from './services/auth.service';
import { ConsentBannerComponent } from './shared/consent-banner/consent-banner';
import { EnvironmentBannerComponent } from './shared/environment-banner/environment-banner';
import { PlayerHeadshotComponent } from './shared/player-headshot/player-headshot';
import { ToastComponent } from './shared/toast/toast';
import { UnverifiedBannerComponent } from './shared/unverified-banner/unverified-banner';

describe('App', () => {
  const isLoggedIn = signal(true);
  const isAdmin = signal(true);
  const logout = vi.fn();
  const username = signal<string | null>('alex');
  const email = signal<string | null>('alex@example.com');
  const avatarUrl = signal<string | null>(null);

  beforeEach(() => {
    isLoggedIn.set(true);
    isAdmin.set(true);
    username.set('alex');
    email.set('alex@example.com');
    avatarUrl.set(null);
    logout.mockClear();
    return (
      MockBuilder(App)
        // The menus are the thing under test, so the CDK directives that open them stay real,
        // and so does the avatar, whose fallback is part of what the header shows.
        .keep(CdkMenu)
        .keep(CdkMenuItem)
        .keep(CdkMenuTrigger)
        .keep(PlayerHeadshotComponent)
        .mock(ConsentBannerComponent)
        .mock(EnvironmentBannerComponent)
        .mock(ToastComponent)
        .mock(UnverifiedBannerComponent)
        .mock(AuthService, { isLoggedIn, isAdmin, logout })
        .mock(AccountService, { username, email, avatarUrl })
        .provide({
          provide: Router,
          useValue: {
            url: '/projections',
            events: of(),
            createUrlTree: () => ({}),
            serializeUrl: () => '/projections',
          },
        })
        .provide(provideLocationMocks())
    );
  });

  const render = () => {
    const fixture = MockRender(App);
    fixture.detectChanges();
    return fixture;
  };

  const openMenu = (fixture: ReturnType<typeof render>, trigger: string) => {
    const button = fixture.nativeElement.querySelector(trigger) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    return Array.from(document.querySelectorAll<HTMLElement>('.nav-menu-item'));
  };

  const openNavMenu = (fixture: ReturnType<typeof render>) => openMenu(fixture, '.nav-burger');
  const openAccountMenu = (fixture: ReturnType<typeof render>) => openMenu(fixture, '.nav-avatar');

  /**
   * The header's links do not fit beside the logo on a phone, so a menu button stands in for
   * them there. Nothing may be dropped on the way in: what the header can show at a width that
   * fits, the menu has to carry at one that doesn't.
   */
  it('carries every header link into the menu the burger opens', () => {
    const fixture = render();

    const items = openNavMenu(fixture).map((item) => item.textContent?.trim());

    expect(items).toEqual(['Draft mode', 'My projections', "Who's hot", 'Admin']);
  });

  it('leaves out the links the header itself leaves out', () => {
    isAdmin.set(false);
    const fixture = render();

    const items = openNavMenu(fixture).map((item) => item.textContent?.trim());

    expect(items).not.toContain('Admin');
    expect(items).toContain("Who's hot");
  });

  /**
   * The page is a build-flag feature, and a link into a page the router will bounce is worse
   * than no link, so the nav has to drop it wherever it appears.
   */
  it("drops the Who's hot link when the page is switched off", () => {
    const original = environment.whosHotEnabled;
    environment.whosHotEnabled = false;
    try {
      const fixture = render();

      const header = fixture.nativeElement.textContent ?? '';
      expect(header).not.toContain("Who's hot");
      expect(openNavMenu(fixture).map((item) => item.textContent?.trim())).not.toContain(
        "Who's hot",
      );
    } finally {
      environment.whosHotEnabled = original;
    }
  });

  /**
   * The account lives behind the avatar at the right edge, at every width: the links fold into
   * the burger on a phone, but who you are and how you leave have to stay a tap away.
   */
  it('offers the profile and signing out from the account menu', () => {
    const fixture = render();

    const items = openAccountMenu(fixture).map((item) => item.textContent?.trim());

    expect(items).toEqual(['Profile', 'Sign out']);
  });

  it('says who is signed in at the top of the account menu', () => {
    const fixture = render();
    openAccountMenu(fixture);

    const identity = document.querySelector('.account-menu-identity')?.textContent ?? '';

    expect(identity).toContain('alex');
    expect(identity).toContain('alex@example.com');
  });

  it('says so when the account has not picked a username yet', () => {
    username.set(null);
    const fixture = render();
    openAccountMenu(fixture);

    expect(document.querySelector('.account-menu-name')?.textContent?.trim()).toEqual(
      'No username yet',
    );
  });

  it('signs out from the account menu', () => {
    const fixture = render();
    const signOut = openAccountMenu(fixture).find(
      (item) => item.textContent?.trim() === 'Sign out',
    );

    signOut?.click();

    expect(logout).toHaveBeenCalledOnce();
  });

  it('draws the first letter of the username while there is no picture', () => {
    const fixture = render();

    const avatar = fixture.nativeElement.querySelector('.nav-avatar') as HTMLElement;

    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.textContent?.trim()).toEqual('A');
  });

  it('falls back to the email for an account without a username', () => {
    username.set(null);
    email.set('zoe@example.com');
    const fixture = render();

    const avatar = fixture.nativeElement.querySelector('.nav-avatar') as HTMLElement;

    expect(avatar.textContent?.trim()).toEqual('Z');
  });

  it('draws the picture once the account has one', () => {
    avatarUrl.set('blob:http://localhost/avatar');
    const fixture = render();

    const image = fixture.nativeElement.querySelector('.nav-avatar img') as HTMLImageElement;

    expect(image.getAttribute('src')).toEqual('blob:http://localhost/avatar');
  });

  it('offers no menu at all to a signed-out visitor', () => {
    isLoggedIn.set(false);
    const fixture = render();

    expect(fixture.nativeElement.querySelector('.nav-burger')).toBeNull();
    expect(fixture.nativeElement.querySelector('.nav-avatar')).toBeNull();
  });
});
