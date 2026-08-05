import { Component } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Off-season heads-up about the cached Yahoo player data. While `YAHOO_SYNC_DISABLED` is set
 * (between NHL seasons) the daily player sync is paused, so team affiliations drift out of date
 * and newly drafted rookies aren't in the pool yet. Dropped into both the demo editor and the
 * signed-in projection editor; it self-gates on the flag and renders nothing when sync is live.
 */
@Component({
  selector: 'app-offseason-data-notice',
  templateUrl: './offseason-data-notice.html',
  styleUrl: './offseason-data-notice.css',
})
export class OffseasonDataNoticeComponent {
  protected readonly show = environment.yahooSyncDisabled;
}
