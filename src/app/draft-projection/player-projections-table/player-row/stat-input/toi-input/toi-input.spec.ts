import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { ToiInputComponent } from './toi-input';
import { FormatToiPipe } from '../../../../../pipes/format-toi.pipe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ToiInputComponent', () => {
  beforeEach(() => {
    return MockBuilder(ToiInputComponent).keep(FormatToiPipe);
  });

  it('should create', () => {
    const fixture = MockRender(ToiInputComponent, {
      toiInSeconds: 120,
    });
    expect(fixture.point.componentInstance).toBeDefined();
  });

  it('should display formatted value', () => {
    MockRender(ToiInputComponent, {
      toiInSeconds: 120,
    });
    const input = ngMocks.find('input').nativeElement as HTMLInputElement;
    expect(input.value).toEqual('2:00');
  });

  it('should emit toiInput on input', () => {
    const fixture = MockRender(ToiInputComponent, {
      toiInSeconds: 120,
    });
    const onInputSpy = vi.fn();
    fixture.point.componentInstance.toiInput.subscribe(onInputSpy);

    const input = ngMocks.find('input');
    ngMocks.trigger(input, 'input', { target: { value: '3:00' } } as unknown as Event);

    expect(onInputSpy).toHaveBeenCalled();
  });

  it('should emit toiKeydown on keydown', () => {
    const fixture = MockRender(ToiInputComponent, {
      toiInSeconds: 120,
    });
    const onKeydownSpy = vi.fn();
    fixture.point.componentInstance.toiKeydown.subscribe(onKeydownSpy);

    const input = ngMocks.find('input');
    ngMocks.trigger(input, 'keydown', { key: 'ArrowUp' });

    expect(onKeydownSpy).toHaveBeenCalled();
  });

  it('shows the touch stepper only while the field is being edited', () => {
    const fixture = MockRender(ToiInputComponent, {
      toiInSeconds: 120,
    });
    expect(ngMocks.findAll('app-stat-stepper')).toHaveLength(0);

    ngMocks.trigger(ngMocks.find('input'), 'focus');
    fixture.detectChanges();

    expect(ngMocks.findAll('app-stat-stepper')).toHaveLength(1);
  });

  it('turns a stepper press into the arrow key the table already moves the clock by', () => {
    const fixture = MockRender(ToiInputComponent, {
      toiInSeconds: 120,
    });
    const pressed: string[] = [];
    fixture.point.componentInstance.toiKeydown.subscribe((event) => pressed.push(event.key));

    ngMocks.trigger(ngMocks.find('input'), 'focus');
    fixture.detectChanges();
    ngMocks.output(ngMocks.find('app-stat-stepper'), 'stepped').emit(1);
    ngMocks.output(ngMocks.find('app-stat-stepper'), 'stepped').emit(-1);

    expect(pressed).toEqual(['ArrowUp', 'ArrowDown']);
  });

  it('should reset input value on blur', () => {
    const fixture = MockRender(ToiInputComponent, {
      toiInSeconds: 120,
    });
    const input = ngMocks.find('input').nativeElement as HTMLInputElement;

    // Simulate user typing something that doesn't trigger onInput or triggers it but signal doesn't change
    input.value = 'invalid';

    ngMocks.trigger(input, 'blur');
    fixture.detectChanges();

    expect(input.value).toEqual('2:00');
  });
});
