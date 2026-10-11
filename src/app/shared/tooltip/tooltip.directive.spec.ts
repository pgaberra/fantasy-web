import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TooltipDirective } from './tooltip.directive';
import { TooltipText } from './tooltip';

@Component({
  imports: [TooltipDirective],
  template: `<button [appTooltip]="text()">host</button>`,
})
class HostComponent {
  readonly text = signal<TooltipText | null>(null);
}

function overlayText(): string {
  TestBed.inject(ApplicationRef).tick();
  return document.querySelector('.cdk-overlay-container')?.textContent ?? '';
}

describe('TooltipDirective', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  function setup(initial: TooltipText | null) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.text.set(initial);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    return { fixture, button };
  }

  it('describes the host for screen readers only while there is text', () => {
    const { fixture, button } = setup('Over 100%');
    expect(button.getAttribute('aria-describedby')).toBeTruthy();

    fixture.componentInstance.text.set(null);
    fixture.detectChanges();
    expect(button.getAttribute('aria-describedby')).toBeNull();
  });

  it('shows the tooltip bubble on hover and removes it on leave', () => {
    const { button } = setup('Over 100%');

    button.dispatchEvent(new MouseEvent('mouseenter'));
    expect(overlayText()).toContain('Over 100%');

    button.dispatchEvent(new MouseEvent('mouseleave'));
    expect(overlayText()).not.toContain('Over 100%');
  });

  it('dismisses itself when the trigger is activated', () => {
    const { button } = setup('Over 100%');
    button.dispatchEvent(new MouseEvent('mouseenter'));
    expect(overlayText()).toContain('Over 100%');

    // A tap synthesises mouseenter and never a mouseleave, so without this the bubble would sit
    // over whatever the button just opened.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlayText()).not.toContain('Over 100%');
  });

  it('does not open a tooltip when there is no text', () => {
    const { button } = setup(null);
    button.dispatchEvent(new MouseEvent('mouseenter'));
    expect(overlayText()).toEqual('');
  });

  it('hides an open tooltip when the text is cleared', () => {
    const { fixture, button } = setup('Over 100%');
    button.dispatchEvent(new MouseEvent('mouseenter'));
    expect(overlayText()).toContain('Over 100%');

    fixture.componentInstance.text.set(null);
    fixture.detectChanges();
    expect(overlayText()).not.toContain('Over 100%');
  });

  it('shows a list tip as one bullet per item, and describes it as one line', () => {
    const { button } = setup(['Team share: starters only.', 'All games: every game.']);
    const description = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toEqual('Team share: starters only. All games: every game.');

    button.dispatchEvent(new MouseEvent('mouseenter'));
    TestBed.inject(ApplicationRef).tick();
    const items = [...document.querySelectorAll('.cdk-overlay-container li')].map((li) =>
      li.textContent?.trim(),
    );
    expect(items).toEqual(['Team share: starters only.', 'All games: every game.']);
  });
});
