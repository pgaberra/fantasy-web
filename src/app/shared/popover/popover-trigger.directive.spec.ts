import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PopoverTriggerDirective } from './popover-trigger.directive';
import { OpenPopovers } from './open-popovers';

@Component({
  imports: [PopoverTriggerDirective],
  template: `
    <button id="labelled" [appPopover]="menu">League setup</button>
    <button id="icon-only" aria-label="Column settings for Goals" [appPopover]="menu"></button>
    <button id="elsewhere">Elsewhere</button>
    <ng-template #menu>
      <button id="menu-item">Hide column</button>
    </ng-template>
  `,
})
class HostComponent {}

function panel(): HTMLElement | null {
  return document.querySelector('.app-popover-panel');
}

describe('PopoverTriggerDirective and OpenPopovers', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = (id: string) =>
      fixture.nativeElement.querySelector(`#${id}`) as HTMLButtonElement;
    return { fixture, button };
  }

  it('clears an open popover when a dialog takes the screen', () => {
    const { button } = setup();
    button('labelled').click();
    expect(panel()).toBeTruthy();

    // What a blocking dialog does on the way in: the menu that raised it has no reason of its
    // own to close, so it would sit on top of the dialog.
    TestBed.inject(OpenPopovers).closeAll();

    expect(panel()).toBeNull();
  });

  it('moves focus into the popover so a keyboard user lands in the menu they opened', () => {
    const { button } = setup();
    button('labelled').click();

    expect(document.activeElement?.id).toEqual('menu-item');
  });

  it('returns focus to the trigger when Escape closes the popover', () => {
    const { button } = setup();
    const trigger = button('labelled');
    trigger.click();

    panel()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(panel()).toBeNull();
    expect(document.activeElement).toEqual(trigger);
  });

  it('closes itself when focus leaves for the rest of the page', () => {
    const { button } = setup();
    button('labelled').click();

    const outside = button('elsewhere');
    document
      .querySelector('#menu-item')
      ?.dispatchEvent(new FocusEvent('focusout', { relatedTarget: outside, bubbles: true }));

    expect(panel()).toBeNull();
    // Focus is on its way out of the menu, so closing must not drag it back to the trigger.
    expect(document.activeElement).not.toEqual(button('labelled'));
  });

  it('stays open while focus moves between controls inside it', () => {
    const { button } = setup();
    button('labelled').click();
    const item = document.querySelector('#menu-item') as HTMLElement;

    item.dispatchEvent(new FocusEvent('focusout', { relatedTarget: item, bubbles: true }));

    expect(panel()).not.toBeNull();
  });

  it("names the panel after the trigger's own label when the trigger is icon-only", () => {
    const { button } = setup();
    button('icon-only').click();

    expect(panel()?.getAttribute('aria-label')).toEqual('Column settings for Goals');
    expect(panel()?.getAttribute('role')).toEqual('dialog');
  });

  it('names the panel after the trigger text when there is any', () => {
    const { button } = setup();
    button('labelled').click();

    expect(panel()?.getAttribute('aria-label')).toEqual('League setup');
  });
});
