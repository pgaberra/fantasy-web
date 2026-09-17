import { Component, computed, input, output } from '@angular/core';
import { YahooSync } from '../../api/models/yahoo-sync';
import { EspnSync } from '../../api/models/espn-sync';
import { IconComponent } from '../icon/icon';
import { TooltipDirective } from '../tooltip/tooltip.directive';

/**
 * The one button that says where a set of league settings came from. With no league yet it is
 * the call to import one; once there is one it stops asking and starts reporting — same place,
 * same dialog behind it, so re-syncing or switching league is still one click.
 *
 * <p>Every surface that holds league settings draws it: the projection editor, Who's hot and the
 * draft picker. It was a copy of the same markup in each until the third surface needed it.
 */
@Component({
  selector: 'app-league-import-button',
  imports: [IconComponent, TooltipDirective],
  templateUrl: './league-import-button.html',
  styleUrl: './league-import-button.css',
})
export class LeagueImportButtonComponent {
  /** At most one of the two is set — a set of settings came from one league. */
  readonly yahooSync = input<YahooSync | null>(null);
  readonly espnSync = input<EspnSync | null>(null);

  readonly pressed = output<void>();

  readonly leagueName = computed(
    () => this.yahooSync()?.leagueName ?? this.espnSync()?.leagueName ?? null,
  );

  /** Which platform that league is on, so the button can wear its mark. */
  readonly provider = computed<'yahoo' | 'espn' | null>(() => {
    if (this.yahooSync()) {
      return 'yahoo';
    }
    return this.espnSync() ? 'espn' : null;
  });
}
