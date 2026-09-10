import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The one thing that says "this is working". Two shapes, because a wait has two jobs depending on
 * how much of the screen is waiting:
 *
 * - `page` (the default) fills the content area with a spinner, for when there is nothing yet to
 *   look at.
 * - `inline` sits in the flow of text with a label and moving dots, for a status line or a button
 *   whose own label has to keep its place.
 *
 * Both move, which is the whole point. Before this component the app had one shared spinner that
 * only fitted the page shape, so all 30 inline waits fell back to a hand-written string ending in
 * an ellipsis. "Loading preview..." with a fixed ellipsis is indistinguishable from a screen that
 * has stopped, and nobody can tell a slow request from a dead one.
 *
 * The dots run through one, two and three, so their width is reserved up front: left to size
 * themselves they would shove the text beside them three times a second. `prefers-reduced-motion`
 * gets a still ellipsis, which is the character the app used to type by hand, now kept only where
 * motion is unwelcome.
 */
@Component({
  selector: 'app-loading-indicator',
  templateUrl: './loading-indicator.html',
  styleUrl: './loading-indicator.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingIndicatorComponent {
  readonly variant = input<'page' | 'inline'>('page');
  /**
   * What is being waited on, as a verb phrase carrying no ellipsis of its own: "Loading preview",
   * "Syncing". The dots supply the ellipsis, and a label bringing one would render five.
   */
  readonly label = input('');
}
