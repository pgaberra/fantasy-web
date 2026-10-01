import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { LazyUnverifiedBannerComponent } from './lazy-unverified-banner';

describe('LazyUnverifiedBannerComponent', () => {
  async function render(isLoggedIn: boolean, isEmailVerified: boolean) {
    await TestBed.configureTestingModule({
      imports: [LazyUnverifiedBannerComponent],
      providers: [
        {
          provide: AuthService,
          useValue: { isLoggedIn: signal(isLoggedIn), isEmailVerified: signal(isEmailVerified) },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(LazyUnverifiedBannerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws the nudge for a signed-in account that has not verified its address', async () => {
    const element = await render(true, false);

    expect(element.querySelector('.unverified-banner')).not.toBeNull();
  });

  it('loads nothing for a verified account', async () => {
    const element = await render(true, true);

    expect(element.querySelector('app-unverified-banner')).toBeNull();
  });

  it('loads nothing for a signed-out visitor', async () => {
    const element = await render(false, true);

    expect(element.querySelector('app-unverified-banner')).toBeNull();
  });
});
