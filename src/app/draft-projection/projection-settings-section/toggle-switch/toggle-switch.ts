import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-toggle-switch',
  templateUrl: './toggle-switch.html',
  styleUrl: './toggle-switch.css',
})
export class ToggleSwitchComponent {
  on = input<boolean>(false);
  toggled = output<void>();
}
