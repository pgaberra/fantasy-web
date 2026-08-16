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
