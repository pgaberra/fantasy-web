import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PASSWORD_REQUIREMENTS } from '../password-policy';
import { IconComponent } from '../../shared/icon/icon';

@Component({
  selector: 'app-password-requirements',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './password-requirements.html',
  styleUrl: './password-requirements.css',
})
export class PasswordRequirementsComponent {
  readonly password = input.required<string>();

  readonly requirements = computed(() =>
    PASSWORD_REQUIREMENTS.map((requirement) => ({
      key: requirement.key,
      label: requirement.label,
      met: requirement.isMet(this.password()),
    })),
  );

  readonly metCount = computed(
    () => this.requirements().filter((requirement) => requirement.met).length,
  );
}
