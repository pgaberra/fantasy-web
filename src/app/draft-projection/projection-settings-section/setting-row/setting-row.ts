import { Component, input } from '@angular/core';
import { HelpTipComponent } from '../../../shared/help-tip/help-tip';

@Component({
  selector: 'app-setting-row',
  imports: [HelpTipComponent],
  host: { class: 'setting-row' },
  templateUrl: './setting-row.html',
  styleUrl: './setting-row.css',
})
export class SettingRowComponent {
  name = input.required<string>();
  desc = input<string>('');
}
