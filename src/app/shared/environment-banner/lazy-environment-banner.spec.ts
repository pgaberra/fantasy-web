import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { VersionService } from '../../services/version.service';
import { LazyEnvironmentBannerComponent } from './lazy-environment-banner';

describe('LazyEnvironmentBannerComponent', () => {
  async function render(environmentName: string) {
    await TestBed.configureTestingModule({
      imports: [LazyEnvironmentBannerComponent],
      providers: [{ provide: VersionService, useValue: { getVersions: () => of([]) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(LazyEnvironmentBannerComponent);
    fixture.componentRef.setInput('environmentName', environmentName);
    fixture.componentRef.setInput('version', '1.2.3');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws the banner on staging', async () => {
    const element = await render('staging');

    expect(element.querySelector('app-environment-banner')).not.toBeNull();
    expect(element.textContent).toContain('STAGING · v1.2.3');
  });

  it('never loads it in production', async () => {
    const element = await render('production');

    expect(element.querySelector('app-environment-banner')).toBeNull();
  });
});
