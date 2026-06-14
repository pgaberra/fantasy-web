import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-environment-banner',
  standalone: true,
  templateUrl: './environment-banner.html',
  styleUrl: './environment-banner.css',
})
export class EnvironmentBannerComponent {
  readonly environmentName = input.required<string>();
  readonly version = input('');

  readonly visible = computed(() => this.environmentName() === 'staging');

  readonly label = computed(() => {
    const name = this.environmentName().toUpperCase();
    const trimmedVersion = this.version().trim();
    if (!trimmedVersion) {
      return name;
    }
    const formattedVersion = /^\d/.test(trimmedVersion) ? `v${trimmedVersion}` : trimmedVersion;
    return `${name} · ${formattedVersion}`;
  });
}
