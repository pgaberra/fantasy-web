import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, expect, it, vi } from 'vitest';
import { RegisterComponent } from './register';
import { AuthFormComponent } from '../auth-form/auth-form';
import { AuthService } from '../../services/auth.service';

const rememberReturnUrl = vi.fn();

function setup(queryParams: Record<string, string>) {
  rememberReturnUrl.mockClear();
  return MockBuilder(RegisterComponent)
    .provide({ provide: AuthService, useValue: { rememberReturnUrl } })
    .provide({
      provide: ActivatedRoute,
      useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
    });
}

async function subtitleFor(queryParams: Record<string, string>) {
  await setup(queryParams);
  const fixture = MockRender(RegisterComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  return ngMocks.input(ngMocks.find(AuthFormComponent), 'subtitle');
}

describe('RegisterComponent', () => {
  /**
   * The form now appears on a click somewhere else — a button on a shared projection — so it says
   * what that click was for. Without the line it reads as the site changing the subject.
   */
  it('says why a visitor sent here from a shared projection needs an account', async () => {
    expect(await subtitleFor({ reason: 'shared-board', returnUrl: '/s/abc123?action=draft' })).toBe(
      'You need an account to save a copy of this projection.',
    );
  });

  it('says nothing extra to someone who came to the form on purpose', async () => {
    expect(await subtitleFor({})).toBeUndefined();
  });

  /** The value rides on a URL anyone can edit, so only the reasons the form knows are shown. */
  it('ignores a reason it does not recognise', async () => {
    expect(await subtitleFor({ reason: 'you-have-won-a-prize' })).toBeUndefined();
  });

  it('hands the return URL to AuthService, which holds it across the hop to Google', async () => {
    await subtitleFor({ returnUrl: '/s/abc123?action=projection' });

    expect(rememberReturnUrl).toHaveBeenCalledWith('/s/abc123?action=projection');
  });
});
