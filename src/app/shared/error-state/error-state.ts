import { Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon';
import { FAILURE_ON_OUR_SIDE_MESSAGE, isFailureOnOurSide } from '../http-error';

@Component({
  selector: 'app-error-state',
  imports: [IconComponent],
  standalone: true,
  templateUrl: './error-state.html',
  styleUrl: './error-state.css',
})
export class ErrorStateComponent {
  readonly title = input('Something went wrong');
  readonly message = input('Check your connection and try again.');
  /** The failure itself. One on our side replaces a message that points at the reader's connection. */
  readonly error = input<unknown>();
  readonly retryable = input(true);
  readonly retry = output<void>();

  protected readonly shownMessage = computed(() =>
    isFailureOnOurSide(this.error()) ? FAILURE_ON_OUR_SIDE_MESSAGE : this.message(),
  );
}
