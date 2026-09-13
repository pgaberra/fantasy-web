import { HttpErrorResponse } from '@angular/common/http';
import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorStateComponent } from './error-state';
import { FAILURE_ON_OUR_SIDE_MESSAGE, RequestTimeoutError } from '../http-error';

describe('ErrorStateComponent', () => {
  beforeEach(() => {
    return MockBuilder(ErrorStateComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const shownMessage = (params: Record<string, unknown>): string | undefined => {
    const fixture = MockRender(ErrorStateComponent, params);
    return fixture.nativeElement.querySelector('.state-message')?.textContent?.trim();
  };

  it('renders the given title and message', () => {
    const fixture = MockRender(ErrorStateComponent, {
      title: 'Could not load',
      message: 'Please try again.',
    });

    const title = fixture.nativeElement.querySelector('.state-title');
    const message = fixture.nativeElement.querySelector('.state-message');
    expect(title?.textContent?.trim()).toEqual('Could not load');
    expect(message?.textContent?.trim()).toEqual('Please try again.');
  });

  it.each([500, 502, 503, 504])('says the problem is ours for a %i', (status) => {
    expect(
      shownMessage({
        message: 'Check your connection and try again.',
        error: new HttpErrorResponse({ status }),
      }),
    ).toEqual(FAILURE_ON_OUR_SIDE_MESSAGE);
  });

  it('says the problem is ours when the server never answered', () => {
    expect(
      shownMessage({
        message: 'Check your connection and try again.',
        error: new RequestTimeoutError('GET', '/api/v1/projections', 20_000),
      }),
    ).toEqual(FAILURE_ON_OUR_SIDE_MESSAGE);
  });

  it('keeps the connection message for a failed request while the browser is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    expect(
      shownMessage({
        message: 'Check your connection and try again.',
        error: new HttpErrorResponse({ status: 0 }),
      }),
    ).toEqual('Check your connection and try again.');
  });

  it('keeps the given message for a failure the server answered', () => {
    expect(
      shownMessage({
        message: 'Check your connection and try again.',
        error: new HttpErrorResponse({ status: 404 }),
      }),
    ).toEqual('Check your connection and try again.');
  });

  it('emits retry when the button is clicked', () => {
    const retry = vi.fn();
    const fixture = MockRender(ErrorStateComponent, { retry });

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button).not.toBeNull();
    button.click();

    expect(retry).toHaveBeenCalledOnce();
  });

  it('hides the retry button when not retryable', () => {
    const fixture = MockRender(ErrorStateComponent, { retryable: false });

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
