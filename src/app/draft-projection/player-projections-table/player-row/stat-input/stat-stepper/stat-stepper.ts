import { Component, output } from '@angular/core';

/**
 * The up/down pair a phone has no other way to reach: a number field offers no spinner on touch,
 * and the numeric keyboard has no arrow keys. It rides under the field being edited and is hidden
 * wherever a real pointer and the arrow keys are available.
 */
@Component({
  selector: 'app-stat-stepper',
  templateUrl: './stat-stepper.html',
  styleUrl: './stat-stepper.css',
})
export class StatStepperComponent {
  readonly stepped = output<1 | -1>();

  /**
   * Steps on the press rather than on the click, and cancels the press's default action: that
   * action is moving focus, and letting focus leave the field would close the phone keyboard and
   * take this control off the screen along with it.
   */
  onPress(event: Event, direction: 1 | -1) {
    event.preventDefault();
    this.stepped.emit(direction);
  }
}
