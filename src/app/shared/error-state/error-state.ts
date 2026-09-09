import { Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon';

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
  readonly retryable = input(true);
  readonly retry = output<void>();
}
