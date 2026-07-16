import { Component } from '@angular/core';

/**
 * Static privacy policy.
 *
 * The content describes what the code actually does — the tables in db-service, the
 * processors we really send data to, the hosts the browser really contacts, and the storage
 * we really set. If any of those change, this page has to change with them; it is not
 * boilerplate, and a stale privacy policy is worse than none.
 *
 * The `privacy__blank` markers flag the values only the site owner can supply (legal name,
 * contact address). They are deliberately loud, so an unfinished policy can't quietly ship.
 */
@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.html',
  styleUrl: './privacy.css',
})
export class PrivacyComponent {
  protected readonly lastUpdated = '17 July 2026';
}
