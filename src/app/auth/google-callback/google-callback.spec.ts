import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MockBuilder, MockRender } from 'ng-mocks';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleCallbackComponent } from './google-callback';
import { AuthService } from '../../services/auth.service';

const completeGoogleLogin = vi.fn();

async function render(params: Record<string, string>) {
  await MockBuilder(GoogleCallbackComponent)
    .provide({
      provide: ActivatedRoute,
      useValue: { snapshot: { queryParamMap: convertToParamMap(params) } },
    })
    .provide({ provide: AuthService, useValue: { completeGoogleLogin } });
  return MockRender(GoogleCallbackComponent);
}

describe('GoogleCallbackComponent', () => {
  beforeEach(() => completeGoogleLogin.mockReset());

  it('exchanges the code when code and state are present', async () => {
    completeGoogleLogin.mockReturnValue(of({}));

    const fixture = await render({ code: 'auth-code', state: 'st-1' });

    expect(completeGoogleLogin).toHaveBeenCalledWith('auth-code', 'st-1');
    expect(fixture.point.componentInstance.errorMessage()).toEqual(null);
  });

  it('shows a cancellation message and does not exchange when the redirect was denied', async () => {
    const fixture = await render({ error: 'access_denied' });

    expect(completeGoogleLogin).not.toHaveBeenCalled();
    expect(fixture.point.componentInstance.errorMessage()).toContain('cancelled');
  });

  it('shows an error and does not exchange when the code is missing', async () => {
    const fixture = await render({ state: 'st-1' });

    expect(completeGoogleLogin).not.toHaveBeenCalled();
    expect(fixture.point.componentInstance.errorMessage()).toContain('failed');
  });

  it('surfaces an error when the exchange fails', async () => {
    completeGoogleLogin.mockReturnValue(throwError(() => new Error('nope')));

    const fixture = await render({ code: 'auth-code', state: 'st-1' });

    expect(fixture.point.componentInstance.errorMessage()).toContain('failed');
  });
});
