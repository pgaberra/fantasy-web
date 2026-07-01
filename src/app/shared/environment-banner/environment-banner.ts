import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { VersionService } from '../../services/version.service';

@Component({
  selector: 'app-environment-banner',
  standalone: true,
  templateUrl: './environment-banner.html',
  styleUrl: './environment-banner.css',
})
export class EnvironmentBannerComponent {
  private readonly versionService = inject(VersionService);

  readonly environmentName = input.required<string>();
  readonly version = input('');
  readonly isAdmin = input(false);

  readonly visible = computed(
    () =>
      this.environmentName() === 'staging' ||
      (this.environmentName() === 'production' && this.isAdmin()),
  );
  readonly open = signal(false);

  readonly versionsResource = rxResource({
    params: () => (this.open() ? {} : undefined),
    stream: () => this.versionService.getVersions(),
    defaultValue: [],
  });

  readonly label = computed(() => {
    const name = this.environmentName().toUpperCase();
    const trimmedVersion = this.version().trim();
    if (!trimmedVersion) {
      return name;
    }
    const formattedVersion = /^\d/.test(trimmedVersion) ? `v${trimmedVersion}` : trimmedVersion;
    return `${name} · ${formattedVersion}`;
  });

  toggle(): void {
    this.open.update((isOpen) => !isOpen);
  }
}
