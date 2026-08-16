import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { StatStepperComponent } from './stat-stepper';
import { beforeEach, describe, expect, it } from 'vitest';

describe('StatStepperComponent', () => {
  beforeEach(() => MockBuilder(StatStepperComponent));

  const pressButton = (index: number) => {
    const fixture = MockRender(StatStepperComponent);
    const emitted: (1 | -1)[] = [];
    fixture.point.componentInstance.stepped.subscribe((direction) => emitted.push(direction));

    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    ngMocks.findAll('button')[index].nativeElement.dispatchEvent(event);

    return { emitted, event };
  };

  it('steps up on the second button', () => {
    expect(pressButton(1).emitted).toEqual([1]);
  });

  it('steps down on the first button', () => {
    expect(pressButton(0).emitted).toEqual([-1]);
  });

  it('cancels the press so the field it belongs to keeps focus', () => {
    expect(pressButton(1).event.defaultPrevented).toEqual(true);
  });
});
