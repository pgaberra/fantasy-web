import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { TooltipDirective } from '../../../../shared/tooltip/tooltip.directive';
import { IconComponent } from '../../../../shared/icon/icon';

/** How a platform is named in a sentence. */
export type PlatformName = 'Yahoo' | 'ESPN';

/**
 * Asked when the user opens the other platform's tab while a league is synced: the settings can
 * follow only one league, so moving to the other platform lets go of this one. Go on, and the
 * league is disconnected; don't, and the tab stays where it was.
 */
@Component({
  selector: 'app-platform-switch-dialog',
  imports: [TooltipDirective, IconComponent],
  templateUrl: './platform-switch-dialog.html',
  styleUrl: './platform-switch-dialog.css',
})
export class PlatformSwitchDialogComponent {
  /**
   * Focus starts on Cancel, inside the card: Escape is heard there, and so goes no further than
   * this question — not on to the import dialog around it — and Enter cannot disconnect by accident.
   */
  constructor() {
    afterNextRender(() => this.cancelButton()?.nativeElement.focus());
  }

  /** The platform the league is synced from. */
  readonly linkedPlatform = input.required<PlatformName>();
  readonly leagueName = input.required<string>();
  /** The platform whose tab was opened. */
  readonly targetPlatform = input.required<PlatformName>();

  readonly confirm = output<void>();
  /** The cross, Escape and Cancel: stay on the tab, and keep the league. */
  readonly cancelled = output<void>();

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancel');
}
