import { Component } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Off-season heads-up about the cached Yahoo player data: while the daily player sync is paused
 * between NHL seasons, team affiliations drift out of date and newly drafted rookies aren't in
 * the pool yet. Dropped into both the demo editor and the signed-in projection editor; it
 * self-gates on `OFFSEASON_ENABLED` and renders nothing unless that flag is explicitly on.
 *
 * The flag is its own switch rather than a read of `yahooSyncDisabled`: sync stays paused for
 * reasons that have nothing to do with the calendar (a revoked Yahoo API key, say), and none of
 * those should put an "it's the off-season" banner in front of every visitor.
 */
@Component({
  selector: 'app-offseason-data-notice',
  templateUrl: './offseason-data-notice.html',
  styleUrl: './offseason-data-notice.css',
})
export class OffseasonDataNoticeComponent {
  protected readonly show = environment.offseasonEnabled;
}
