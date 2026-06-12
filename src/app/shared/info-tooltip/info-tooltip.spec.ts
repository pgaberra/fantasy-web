import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { InfoTooltipComponent } from './info-tooltip';

describe('InfoTooltipComponent', () => {
  beforeEach(() => {
    return MockBuilder(InfoTooltipComponent);
  });

  it('renders a help icon and the tooltip text', () => {
    const fixture = MockRender(InfoTooltipComponent, { text: 'Helpful explanation' });

    const icon = fixture.nativeElement.querySelector('.info-icon');
    const content = fixture.nativeElement.querySelector('.tooltip-content');

    expect(icon?.textContent).toEqual('?');
    expect(content?.textContent?.trim()).toEqual('Helpful explanation');
  });
});
