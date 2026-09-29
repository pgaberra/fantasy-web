import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { CookieFieldDirective } from './cookie-field';

/** What every cookie field must carry, so a password manager never reads it as a login. */
function expectCookieField(field: HTMLInputElement | null): void {
  expect(field).not.toBeNull();
  expect(field?.type).toEqual('text');
  expect(field?.getAttribute('autocomplete')).toEqual('off');
  expect(field?.getAttribute('data-1p-ignore')).toEqual('');
  expect(field?.getAttribute('data-lpignore')).toEqual('true');
  expect(field?.getAttribute('data-bwignore')).toEqual('');
  expect(field?.getAttribute('data-form-type')).toEqual('other');
  expect(field?.getAttribute('style')).toContain('-webkit-text-security: disc');
}

describe('CookieFieldDirective', () => {
  it('turns a bare input into a masked text field no password manager claims', async () => {
    await MockBuilder(CookieFieldDirective);
    const fixture = MockRender('<input appCookieField aria-label="cookie" />');
    const field = (fixture.nativeElement as HTMLElement).querySelector('input');

    expectCookieField(field);
    expect(field?.getAttribute('spellcheck')).toEqual('false');
    expect(field?.getAttribute('autocapitalize')).toEqual('off');
    expect(field?.getAttribute('autocorrect')).toEqual('off');
  });

  it('keeps the value it is given, since the cookie is sent as typed', async () => {
    await MockBuilder(CookieFieldDirective);
    const fixture = MockRender('<input appCookieField [value]="cookie" />', {
      cookie: 'abc%2Fdef',
    });
    const field = (fixture.nativeElement as HTMLElement).querySelector('input');

    expect(field?.value).toEqual('abc%2Fdef');
  });
});
