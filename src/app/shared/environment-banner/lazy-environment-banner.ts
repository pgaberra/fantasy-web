import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EnvironmentBannerComponent } from './environment-banner';

/**
 * The staging banner, downloaded only where it shows: production never names itself staging, so
 * it never pays for the banner's code in the bundle every visitor loads first.
 */
@Component({
  selector: 'app-lazy-environment-banner',
  imports: [EnvironmentBannerComponent],
  template: `
    @defer (when environmentName() === 'staging') {
      <app-environment-banner [environmentName]="environmentName()" [version]="version()" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LazyEnvironmentBannerComponent {
  readonly environmentName = input.required<string>();
  readonly version = input('');
}
