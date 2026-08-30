import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { of } from 'rxjs';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { App } from './app';
import { environment } from '../environments/environment';
import { AuthService } from './services/auth.service';
import { ConsentBannerComponent } from './shared/consent-banner/consent-banner';
import { EnvironmentBannerComponent } from './shared/environment-banner/environment-banner';
import { ToastComponent } from './shared/toast/toast';
import { UnverifiedBannerComponent } from './shared/unverified-banner/unverified-banner';

describe('App', () => {
  const isLoggedIn = signal(true);
  const isAdmin = signal(true);
  const logout = vi.fn();

  beforeEach(() => {
    isLoggedIn.set(true);
    isAdmin.set(true);
    logout.mockClear();
    return (
      MockBuilder(App)
        // The menu is the thing under test, so the CDK directives that open it stay real.
        .keep(CdkMenu)
        .keep(CdkMenuItem)
        .keep(CdkMenuTrigger)
        .mock(ConsentBannerComponent)
        .mock(EnvironmentBannerComponent)
        .mock(ToastComponent)
        .mock(UnverifiedBannerComponent)
        .mock(AuthService, { isLoggedIn, isAdmin, logout })
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

  const openMenu = (fixture: ReturnType<typeof render>) => {
    const burger = fixture.nativeElement.querySelector('.nav-burger') as HTMLButtonElement;
    burger.click();
    fixture.detectChanges();
    return Array.from(document.querySelectorAll<HTMLElement>('.nav-menu-item'));
  };

  /**
   * The header's links do not fit beside the logo on a phone, so a menu button stands in for
   * them there. Nothing may be dropped on the way in: what the header can show at a width that
   * fits, the menu has to carry at one that doesn't.
   */
  it('carries every header link into the menu the burger opens', () => {
    const fixture = render();

    const items = openMenu(fixture).map((item) => item.textContent?.trim());

    expect(items).toEqual(['Draft Mode', 'My Projections', "Who's hot", 'Admin', 'Sign Out']);
  });

  it('leaves out the links the header itself leaves out', () => {
    isAdmin.set(false);
    const fixture = render();

    const items = openMenu(fixture).map((item) => item.textContent?.trim());

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
      expect(openMenu(fixture).map((item) => item.textContent?.trim())).not.toContain("Who's hot");
    } finally {
      environment.whosHotEnabled = original;
    }
  });

  it('signs out from the menu', () => {
    const fixture = render();
    const signOut = openMenu(fixture).find((item) => item.textContent?.trim() === 'Sign Out');

    signOut?.click();

    expect(logout).toHaveBeenCalledOnce();
  });

  it('offers no menu at all to a signed-out visitor', () => {
    isLoggedIn.set(false);
    const fixture = render();

    expect(fixture.nativeElement.querySelector('.nav-burger')).toBeNull();
  });
});
