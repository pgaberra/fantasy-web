import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { IconComponent, ICON_NAMES } from './icon';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('IconComponent', () => {
  beforeEach(() => {
    return MockBuilder(IconComponent);
  });

  const render = (name: string, size?: number) =>
    MockRender(IconComponent, size === undefined ? { name } : { name, size })
      .nativeElement as HTMLElement;

  it.each(ICON_NAMES)('draws %s', (name) => {
    const svg = render(name).querySelector('svg');

    expect(svg).not.toBeNull();
    // The one that actually bites: a name in ICON_NAMES with no matching `@case` compiles and
    // renders an empty <svg>, which looks like a spacing bug on the screen rather than a missing
    // icon. Every icon has at least one shape.
    expect(svg!.children.length).toBeGreaterThan(0);
  });

  it('puts the shapes in the SVG namespace, not the HTML one', () => {
    // `@switch` inside `<svg>` is the whole design, and an HTML-namespaced <path> is the failure
    // it could produce: it parses, it appears in the DOM, it passes a querySelector, and it draws
    // absolutely nothing. Assert the namespace rather than the tag name.
    const svg = render('info').querySelector('svg')!;

    expect(svg.namespaceURI).toBe(SVG_NS);
    for (const shape of Array.from(svg.children)) {
      expect(shape.namespaceURI).toBe(SVG_NS);
    }
  });

  it('holds every icon to the one spec', () => {
    for (const name of ICON_NAMES) {
      const svg = render(name).querySelector('svg')!;

      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('stroke-width')).toBe('2');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('fill')).toBe('none');
      // An icon never carries the accessible name: that belongs on the control around it.
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('sizes from the input, defaulting to 16', () => {
    const byDefault = render('check').querySelector('svg')!;
    expect(byDefault.getAttribute('width')).toBe('16');
    expect(byDefault.getAttribute('height')).toBe('16');

    const sized = render('check', 48).querySelector('svg')!;
    expect(sized.getAttribute('width')).toBe('48');
    expect(sized.getAttribute('height')).toBe('48');
  });

  it('draws nothing for a name it does not know', () => {
    // Reachable only from JavaScript that skipped the type, but an unknown name must degrade to an
    // empty box rather than throwing inside whatever screen rendered it.
    const svg = render('not-an-icon').querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg!.children.length).toBe(0);
  });
});
