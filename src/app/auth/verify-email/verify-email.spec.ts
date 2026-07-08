import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { VerifyEmailComponent } from './verify-email';
import { AuthService } from '../../services/auth.service';

const verifyEmail = vi.fn(() => of<void>(undefined));

function setup(token: string) {
  verifyEmail.mockClear();
  verifyEmail.mockReturnValue(of<void>(undefined));
  return MockBuilder(VerifyEmailComponent)
    .provide({ provide: AuthService, useValue: { verifyEmail } })
    .provide({
      provide: ActivatedRoute,
      useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
    });
}

describe('VerifyEmailComponent', () => {
  it('verifies the token on load and shows the success state', async () => {
    await setup('verify-token');
    const fixture = MockRender(VerifyEmailComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(verifyEmail).toHaveBeenCalledWith('verify-token');
    const heading = ngMocks.find('.auth-title').nativeElement as HTMLElement;
    expect(heading.textContent).toContain('Email verified');
  });

  it('shows a failure state when the token is rejected', async () => {
    await setup('bad-token');
    verifyEmail.mockReturnValueOnce(throwError(() => new Error('invalid')));
    const fixture = MockRender(VerifyEmailComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const heading = ngMocks.find('.auth-title').nativeElement as HTMLElement;
    expect(heading.textContent).toContain('Verification failed');
  });

  it('shows an invalid-link message and verifies nothing when the token is missing', async () => {
    await setup('');
    const fixture = MockRender(VerifyEmailComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(verifyEmail).not.toHaveBeenCalled();
    const heading = ngMocks.find('.auth-title').nativeElement as HTMLElement;
    expect(heading.textContent).toContain('Invalid link');
  });
});
