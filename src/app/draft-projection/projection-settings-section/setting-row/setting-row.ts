import { Component, input } from '@angular/core';

@Component({
  selector: 'app-setting-row',
  host: { class: 'setting-row' },
  templateUrl: './setting-row.html',
  styleUrl: './setting-row.css',
})
export class SettingRowComponent {
  name = input.required<string>();
  desc = input<string>('');
}
