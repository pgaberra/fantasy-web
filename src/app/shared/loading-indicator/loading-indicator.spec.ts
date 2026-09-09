import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { LoadingIndicatorComponent } from './loading-indicator';

describe('LoadingIndicatorComponent', () => {
  beforeEach(() => {
    return MockBuilder(LoadingIndicatorComponent);
  });

  const render = (inputs: Record<string, unknown> = {}) =>
    MockRender(LoadingIndicatorComponent, inputs).nativeElement as HTMLElement;

  it('fills the content area with a spinner by default', () => {
    const el = render();

    expect(el.querySelector('.loading-container')).not.toBeNull();
    expect(el.querySelector('.loading-spinner')).not.toBeNull();
    expect(el.querySelector('.loading-dots')).toBeNull();
  });

  it('names the page spinner for a screen reader, which has no text to go on', () => {
    const container = render().querySelector('.loading-container')!;

    expect(container.getAttribute('role')).toEqual('status');
    expect(container.getAttribute('aria-label')).toEqual('Loading');
  });

  it('draws the label and the dots inline', () => {
    const el = render({ variant: 'inline', label: 'Loading preview' });

    expect(el.textContent).toContain('Loading preview');
    expect(el.querySelector('.loading-dots')).not.toBeNull();
    expect(el.querySelector('.loading-spinner')).toBeNull();
  });

  it('hides the dots from a screen reader but never the label', () => {
    // The dots are decoration: read out, they arrive as a stream of full stops. The label is the
    // part that says what is happening, so it stays in the accessible text.
    const el = render({ variant: 'inline', label: 'Syncing' });

    expect(el.querySelector('.loading-dots')!.getAttribute('aria-hidden')).toEqual('true');
    expect(el.textContent).toContain('Syncing');
  });

  it('keeps no ellipsis in the markup, because the dots draw it', () => {
    // Two screens used to ship a typed ellipsis in front of the animated dots and drew five or
    // six at once. The component owns the whole ellipsis now, so there is never a second one.
    const el = render({ variant: 'inline', label: 'Finishing sign-in with Google' });

    expect(el.innerHTML).not.toContain('…');
    expect(el.innerHTML).not.toContain('...');
  });
});
