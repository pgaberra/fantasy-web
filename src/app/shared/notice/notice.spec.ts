import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { IconComponent } from '../icon/icon';
import { NoticeComponent } from './notice';

describe('NoticeComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NoticeComponent] }));

  function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(NoticeComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  }

  function iconName(fixture: ReturnType<typeof render>): string | undefined {
    const icon = fixture.debugElement.query(By.directive(IconComponent));
    return icon?.componentInstance.name();
  }

  // The stylesheet keys every tone and shape off these, so they are the component's contract
  // with its own CSS rather than an implementation detail.
  it('says its tone and its shape in classes, which is what the stylesheet reads', () => {
    const fixture = render({ tone: 'error', variant: 'inline' });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.classList.contains('notice')).toBe(true);
    expect(host.classList.contains('notice--error')).toBe(true);
    expect(host.classList.contains('notice--inline')).toBe(true);
    expect(host.classList.contains('notice--warning')).toBe(false);
    expect(host.classList.contains('notice--boxed')).toBe(false);
  });

  it('is a boxed info notice when told nothing, the quietest thing it can be', () => {
    const host = render().nativeElement as HTMLElement;

    expect(host.classList.contains('notice--info')).toBe(true);
    expect(host.classList.contains('notice--boxed')).toBe(true);
  });

  it.each([
    ['info', 'info'],
    ['warning', 'alert-triangle'],
    ['error', 'alert-triangle'],
  ])('draws %s with its own glyph', (tone, expected) => {
    expect(iconName(render({ tone }))).toEqual(expected);
  });

  // The off-season banner is the case: a warning by colour, drawn with an info glyph, because
  // the icon says what the message is about where the tone says how loud it is.
  it('lets a caller name a glyph that its tone would not have chosen', () => {
    expect(iconName(render({ tone: 'warning', icon: 'info' }))).toEqual('info');
  });

  it('draws no glyph at all when asked not to, for a notice that reads as prose', () => {
    const fixture = render({ showIcon: false });

    expect(fixture.debugElement.query(By.directive(IconComponent))).toBeNull();
  });

  // Tone and role are deliberately separate: a warning that has sat on the page since it loaded
  // is not something a screen reader should interrupt for.
  it('takes its role from the caller rather than from its tone', () => {
    expect((render({ tone: 'error' }).nativeElement as HTMLElement).getAttribute('role')).toEqual(
      'status',
    );
    expect(
      (render({ tone: 'info', role: 'alert' }).nativeElement as HTMLElement).getAttribute('role'),
    ).toEqual('alert');
  });
});
