import { describe, expect, it, vi } from 'vitest';
import { leaveFor } from './leave-for';

function fakeWindow(): Window & { fire: (persisted: boolean) => void } {
  const target = new EventTarget();
  const win = {
    location: { href: '' },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    fire: (persisted: boolean) => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: persisted });
      target.dispatchEvent(event);
    },
  };
  return win as unknown as Window & { fire: (persisted: boolean) => void };
}

describe('leaveFor', () => {
  it('sends the browser to the URL', () => {
    const win = fakeWindow();

    leaveFor('https://billing.stripe.com/p/session/x', () => undefined, win);

    expect(win.location.href).toEqual('https://billing.stripe.com/p/session/x');
  });

  // Back restores the page from the back/forward cache with the busy state it left in.
  it('calls back when the page is restored from the back/forward cache', () => {
    const win = fakeWindow();
    const onReturn = vi.fn();

    leaveFor('https://checkout.stripe.com/c/pay/x', onReturn, win);
    win.fire(true);

    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an ordinary page show, which starts the page fresh anyway', () => {
    const win = fakeWindow();
    const onReturn = vi.fn();

    leaveFor('https://checkout.stripe.com/c/pay/x', onReturn, win);
    win.fire(false);

    expect(onReturn).not.toHaveBeenCalled();
  });

  // Leaving twice and coming back twice must not run an old listener again on top of the new one.
  it('calls back once per departure', () => {
    const win = fakeWindow();
    const onReturn = vi.fn();

    leaveFor('https://checkout.stripe.com/c/pay/x', onReturn, win);
    win.fire(true);
    win.fire(true);

    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
