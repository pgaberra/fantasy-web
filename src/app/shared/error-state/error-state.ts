import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-state',
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
