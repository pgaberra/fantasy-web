import { MockBuilder, MockRender } from 'ng-mocks';
import { NgIcon } from '@ng-icons/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IconComponent, ICON_NAMES } from './icon';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('IconComponent', () => {
  beforeEach(() => {
    // ng-mocks replaces every dependency with a mock by default, and a mocked ng-icon draws
    // nothing. Drawing is the whole behaviour under test, so the real one stays.
    return MockBuilder(IconComponent).keep(NgIcon);
  });

  const render = async (inputs: Record<string, unknown>) => {
    const fixture = MockRender(IconComponent, inputs);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  const cssSize = async (inputs: Record<string, unknown>) =>
    ((await render(inputs)).querySelector('ng-icon') as HTMLElement).style.getPropertyValue(
      '--ng-icon__size',
    );

  it.each(ICON_NAMES)('draws %s', async (name) => {
    const svg = (await render({ name })).querySelector('svg');

    expect(svg).not.toBeNull();
    // A name mapped to something that is not a drawing renders an empty box, which on a screen
    // reads as a spacing bug rather than a missing icon. Every icon has at least one shape.
    expect(svg!.children.length).toBeGreaterThan(0);
  });

  it('maps every name to a different drawing', async () => {
    // Two names on one drawing is a copy-paste slip in the map, and nothing else would notice it.
    const drawings = new Set<string>();
    for (const name of ICON_NAMES) {
      drawings.add((await render({ name })).querySelector('svg')!.innerHTML);
    }

    expect(drawings.size).toBe(ICON_NAMES.length);
  });

  it('lands the drawing in the SVG namespace, not the HTML one', async () => {
    // ng-icon inserts the markup from a string. Parsed in the wrong context, the <svg> and its
    // paths come out as HTML elements: present in the DOM, found by querySelector, drawing nothing.
    const svg = (await render({ name: 'info' })).querySelector('svg')!;

    expect(svg.namespaceURI).toBe(SVG_NS);
    for (const shape of Array.from(svg.children)) {
      expect(shape.namespaceURI).toBe(SVG_NS);
    }
  });

  it('holds every icon to the one spec', async () => {
    for (const name of ICON_NAMES) {
      const root = await render({ name });
      const svg = root.querySelector('svg')!;
      const ngIcon = root.querySelector('ng-icon') as HTMLElement;

      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('fill')).toBe('none');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('stroke-linecap')).toBe('round');
      expect(svg.getAttribute('stroke-linejoin')).toBe('round');
      // Lucide's weight is 2 unless the host overrides it, and nothing here ever does.
      expect(svg.getAttribute('style')).toContain('var(--ng-icon__stroke-width, 2)');
      expect(ngIcon.style.getPropertyValue('--ng-icon__stroke-width')).toBe('');
      // An icon never carries the accessible name: that belongs on the control around it.
      expect(ngIcon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('sizes in pixels from a number, defaulting to 16', async () => {
    expect(await cssSize({ name: 'check' })).toBe('16px');
    expect(await cssSize({ name: 'check', size: 48 })).toBe('48px');
  });

  it('takes a CSS length, so an icon can scale with the text around it', async () => {
    expect(await cssSize({ name: 'lock', size: '0.85em' })).toBe('0.85em');
  });

  it('draws nothing, and says nothing, for a name it does not know', async () => {
    // Reachable only from JavaScript that skipped the type. It must degrade to an empty box, not
    // throw inside whatever screen rendered it, and not warn on every change detection either.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const root = await render({ name: 'not-an-icon' });

    expect(root.querySelector('svg')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
