import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorStateComponent } from './error-state';

describe('ErrorStateComponent', () => {
  beforeEach(() => {
    return MockBuilder(ErrorStateComponent);
  });

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
