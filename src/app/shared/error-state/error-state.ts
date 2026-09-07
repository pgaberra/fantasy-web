import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-state',
  standalone: true,
  templateUrl: './error-state.html',
  styleUrl: './error-state.css',
})
export class ErrorStateComponent {
  readonly title = input("Couldn't load this page");
  readonly message = input('Check your connection.');
  readonly retryable = input(true);
  readonly retry = output<void>();
}
