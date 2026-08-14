import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HelpTipComponent } from './help-tip';

function overlayText(): string {
  TestBed.inject(ApplicationRef).tick();
  return document.querySelector('.cdk-overlay-container')?.textContent ?? '';
}

describe('HelpTipComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HelpTipComponent] }));

  function setup() {
    const fixture = TestBed.createComponent(HelpTipComponent);
    fixture.componentRef.setInput('text', 'Goalies projected for fewer games are ranked last.');
    fixture.componentRef.setInput('label', 'What the goalie minimum does');
    fixture.detectChanges();
    return { fixture, trigger: fixture.nativeElement.querySelector('button') as HTMLButtonElement };
  }

  it('names what it explains, since the icon itself reads as nothing', () => {
    const { trigger } = setup();

    expect(trigger.getAttribute('aria-label')).toEqual('What the goalie minimum does');
  });

  it('opens and closes on a tap, which is the only way in on a touch device', () => {
    const { trigger } = setup();

    trigger.click();
    expect(overlayText()).toContain('are ranked last');

    trigger.click();
    expect(overlayText()).not.toContain('are ranked last');
  });

  it('still opens on hover for a mouse', () => {
    const { trigger } = setup();

    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    expect(overlayText()).toContain('are ranked last');

    trigger.dispatchEvent(new MouseEvent('mouseleave'));
    expect(overlayText()).not.toContain('are ranked last');
  });
});
