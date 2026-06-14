import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { EnvironmentBannerComponent } from './environment-banner';
import { VersionService } from '../../services/version.service';
import { ServiceVersion } from '../../api/models/service-version';

describe('EnvironmentBannerComponent', () => {
  const mockVersions: ServiceVersion[] = [
    { name: 'fantasy-web', up: true, version: 'local' },
    { name: 'fantasy-bff', up: true, version: '0.1.5' },
    { name: 'fantasy-db-service', up: false },
  ];

  beforeEach(() =>
    MockBuilder(EnvironmentBannerComponent).mock(VersionService, {
      getVersions: () => of(mockVersions),
    }),
  );

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

  it('keeps the version panel closed until the banner is clicked', () => {
    const fixture = renderBanner('staging', 'local');

    expect(fixture.nativeElement.querySelector('.version-panel')).toEqual(null);
  });

  it('opens a version panel listing every service when the banner is clicked', async () => {
    const fixture = renderBanner('staging', 'local');

    fixture.nativeElement.querySelector('.env-banner').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.version-row');
    expect(rows.length).toEqual(mockVersions.length);
    expect(rows[0].textContent).toContain('fantasy-web');
    expect(rows[0].textContent).toContain('local');
    expect(fixture.nativeElement.querySelector('.version-dot.down')).not.toEqual(null);
  });
});
