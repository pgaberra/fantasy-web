import { Component, input } from '@angular/core';
import { TooltipDirective } from '../tooltip/tooltip.directive';

/**
 * A small info icon that explains the control it sits next to, without spending a line of the
 * panel on prose. Used by the popover menus, where every note competes with the settings for room.
 *
 * The bubble itself is the app's shared tooltip — an overlay, so it is positioned against the
 * viewport and can't be clipped by the popover it opens inside. The trigger is a real `<button>`
 * so the keyboard can reach it, and its click toggles the tooltip for touch, which has no hover.
 */
@Component({
  selector: 'app-help-tip',
  imports: [TooltipDirective],
  templateUrl: './help-tip.html',
  styleUrl: './help-tip.css',
})
export class HelpTipComponent {
  readonly text = input.required<string>();
  /** Names what the tip explains — the trigger itself is an icon with nothing to read. */
  readonly label = input.required<string>();
}
