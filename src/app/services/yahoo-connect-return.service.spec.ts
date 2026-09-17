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

  describe('the page handed back', () => {
    it('is told once that it is the one returned to', () => {
      const returning = new YahooConnectReturnService();
      returning.remember('/draft');
      returning.take();

      expect(returning.returnedTo('/draft')).toBe(true);
      expect(returning.returnedTo('/draft')).toBe(false);
    });

    it('is not confused with another page, which leaves the hand-back for its own page', () => {
      const returning = new YahooConnectReturnService();
      returning.remember('/whos-hot');
      returning.take();

      expect(returning.returnedTo('/home')).toBe(false);
      expect(returning.returnedTo('/whos-hot')).toBe(true);
    });

    it('is never a page nothing was handed back for', () => {
      const returning = new YahooConnectReturnService();
      returning.remember('/draft');

      expect(returning.returnedTo('/draft')).toBe(false);
    });

    it('is not a refused path', () => {
      const returning = new YahooConnectReturnService();
      returning.remember('//evil.example');
      returning.take();

      expect(returning.returnedTo('//evil.example')).toBe(false);
    });
  });

  it('forgets a remembered page', () => {
    service.remember('/whos-hot');
    service.forget();

    expect(service.take()).toBeNull();
  });
});
