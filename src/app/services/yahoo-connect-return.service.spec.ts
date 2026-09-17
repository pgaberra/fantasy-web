import { afterEach, describe, expect, it } from 'vitest';
import { YahooConnectReturnService } from './yahoo-connect-return.service';

describe('YahooConnectReturnService', () => {
  const service = new YahooConnectReturnService();

  afterEach(() => sessionStorage.clear());

  it('hands back the page a connect started from, path and query, once', () => {
    service.remember('/draft/new/standard?source=model');

    expect(service.take()).toBe('/draft/new/standard?source=model');
    expect(service.take()).toBeNull();
  });

  it('has nothing to hand back when no connect was started', () => {
    expect(service.take()).toBeNull();
  });

  /** The stored value becomes a navigation, so nothing that could leave the site survives. */
  it.each([
    ['a protocol-relative host', '//evil.example/projections'],
    ['a backslash browsers read as a slash', '/\\evil.example'],
    ['an absolute URL', 'https://evil.example/'],
    ['a scheme', 'javascript:alert(1)'],
    ['a relative path', 'projections'],
    ['a control character', '/\t/evil.example'],
    ['an oversized path', '/' + 'a'.repeat(2048)],
  ])('refuses %s', (_label, path) => {
    service.remember(path);

    expect(service.take()).toBeNull();
  });

  it('does not let a refused path fall back to an older remembered one', () => {
    service.remember('/whos-hot');
    service.remember('//evil.example');

    expect(service.take()).toBeNull();
  });

  it('refuses a stored value it did not write itself', () => {
    sessionStorage.setItem('slapstat.yahoo-connect-return', '//evil.example');

    expect(service.take()).toBeNull();
  });

  it('forgets a remembered page', () => {
    service.remember('/whos-hot');
    service.forget();

    expect(service.take()).toBeNull();
  });
});
