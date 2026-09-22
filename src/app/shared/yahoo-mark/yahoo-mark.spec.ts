import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, expect, it } from 'vitest';
import { YahooMarkComponent } from './yahoo-mark';

describe('YahooMarkComponent', () => {
  const render = async (size?: string) => {
    await MockBuilder(YahooMarkComponent);
    const fixture = MockRender(YahooMarkComponent, size ? { size } : {});
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('svg') as SVGElement;
  };

  it('draws the mark at the button scale by default', async () => {
    const svg = await render();

    expect(svg.style.width).toEqual('0.85rem');
    expect(svg.style.height).toEqual('0.85rem');
  });

  it('draws it at the card scale when asked', async () => {
    const svg = await render('1.15rem');

    expect(svg.style.width).toEqual('1.15rem');
  });

  /** The accessible name belongs to the control around it, as with every icon in the app. */
  it('is hidden from assistive technology', async () => {
    const svg = await render();

    expect(svg.getAttribute('aria-hidden')).toEqual('true');
  });
});
