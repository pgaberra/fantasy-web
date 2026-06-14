import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { EnvironmentBannerComponent } from './environment-banner';

describe('EnvironmentBannerComponent', () => {
  beforeEach(() => MockBuilder(EnvironmentBannerComponent));

  const renderBanner = (environmentName: string, version = '') =>
    MockRender(EnvironmentBannerComponent, { environmentName, version });

  it('renders the staging banner with an uppercased label and version', () => {
    const fixture = renderBanner('staging', '0.1.5');
    const banner = fixture.nativeElement.querySelector('.env-banner');

    expect(banner).not.toEqual(null);
    expect(banner.textContent.trim()).toEqual('STAGING · v0.1.5');
  });

  it('shows the env name alone when no version is provided', () => {
    const fixture = renderBanner('staging');
    const banner = fixture.nativeElement.querySelector('.env-banner');

    expect(banner.textContent.trim()).toEqual('STAGING');
  });

  it('leaves non-numeric version labels untouched', () => {
    const fixture = renderBanner('staging', 'local');

    expect(fixture.point.componentInstance.label()).toEqual('STAGING · local');
  });

  it('renders nothing outside staging', () => {
    expect(renderBanner('production', '0.1.5').nativeElement.querySelector('.env-banner')).toEqual(
      null,
    );
    expect(renderBanner('development').nativeElement.querySelector('.env-banner')).toEqual(null);
  });
});
