import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect } from 'vitest';
import { provideLocationMocks } from '@angular/common/testing';
import { ClassicLandingComponent } from './classic-landing';
import { LandingDemoComponent } from '../landing-demo/landing-demo';

describe('ClassicLandingComponent', () => {
  it('is the page as it shipped before the rewrite, demo editor included', async () => {
    await MockBuilder(ClassicLandingComponent)
      .mock(LandingDemoComponent)
      .provide(provideLocationMocks());
    const el = MockRender(ClassicLandingComponent).nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toContain('Prepare for the upcoming');
    expect(el.querySelector('app-landing-demo')).toBeTruthy();
  });
});
