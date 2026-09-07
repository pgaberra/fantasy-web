/**
 * jsdom lays nothing out, so it ships no ResizeObserver. A component that observes its own box
 * would otherwise throw on construction in every test that renders it. The stub never reports a
 * resize, which is the truth in a document that never reflows — a test that cares about the
 * callback supplies its own geometry and triggers it directly.
 */
class InertResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= InertResizeObserver;

/**
 * jsdom has no media queries either, and a component that asks what kind of pointer is on the
 * other end would throw before it could render. The stub answers no to everything, which is the
 * truth in a document with no window to measure and nobody pointing at it; a test that wants a
 * capability turned on says so itself.
 */
globalThis.matchMedia ??= (media: string) =>
  ({
    media,
    matches: false,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
