import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { YahooMarkComponent } from './yahoo-mark';

describe('YahooMarkComponent', () => {
  const render = async (inputs: { size?: string; tone?: string } = {}) => {
    await MockBuilder(YahooMarkComponent);
    const fixture = MockRender(YahooMarkComponent, inputs);
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('svg') as SVGElement;
  };

  it('draws the mark at the button scale by default', async () => {
    const svg = await render();

    expect(svg.style.width).toEqual('0.85rem');
    expect(svg.style.height).toEqual('0.85rem');
  });

  it('draws it at the card scale when asked', async () => {
    const svg = await render({ size: '1.15rem' });

    expect(svg.style.width).toEqual('1.15rem');
  });

  /** Yahoo's purple is the mark's own colour, and the default. */
  it('draws in Yahoo purple by default', async () => {
    const svg = await render();

    expect(svg.classList.contains('mark--inherit')).toBe(false);
  });

  /** On a dark button the purple is unreadable, so the mark takes the button's own text colour. */
  it('takes the surrounding text colour when asked', async () => {
    const svg = await render({ tone: 'inherit' });

    expect(svg.classList.contains('mark--inherit')).toBe(true);
  });

  /** The accessible name belongs to the control around it, as with every icon in the app. */
  it('is hidden from assistive technology', async () => {
    const svg = await render();

    expect(svg.getAttribute('aria-hidden')).toEqual('true');
  });
});
