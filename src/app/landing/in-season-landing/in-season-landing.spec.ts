import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';
import { InSeasonLandingComponent } from './in-season-landing';
import { LandingDemoComponent } from '../landing-demo/landing-demo';
import { FeatureService } from '../../services/feature.service';
import { environment } from '../../../environments/environment';

describe('InSeasonLandingComponent', () => {
  const originalOffseason = environment.offseasonEnabled;
  const originalWhosHot = environment.whosHotEnabled;

  afterEach(() => {
    environment.offseasonEnabled = originalOffseason;
    environment.whosHotEnabled = originalWhosHot;
    vi.restoreAllMocks();
  });

  async function render(aiProjection = true) {
    await MockBuilder(InSeasonLandingComponent)
      .mock(LandingDemoComponent)
      .mock(FeatureService, { aiProjection: signal(aiProjection) })
      .provide(provideLocationMocks());
    const fixture = MockRender(InSeasonLandingComponent);
    return fixture.nativeElement as HTMLElement;
  }

  it('talks about the season under way while it is not the off-season', async () => {
    environment.offseasonEnabled = false;
    const el = await render();
    expect(el.querySelector('h1')?.textContent).toContain('The NHL season is on');
  });

  it('talks about the next season in the off-season', async () => {
    environment.offseasonEnabled = true;
    const el = await render();
    expect(el.querySelector('h1')?.textContent).toContain('next NHL fantasy season');
  });

  it('shows the in-season tools and the draft tools with the live editor between them', async () => {
    environment.whosHotEnabled = true;
    const el = await render();
    const titles = Array.from(el.querySelectorAll('.lp-feature-title')).map((t) =>
      t.textContent?.trim(),
    );
    expect(titles).toEqual([
      'Streamer Planner',
      "Who's Hot",
      'Team Power Rankings',
      'Import your Yahoo league',
      'Draft Mode',
      'Share with your league',
    ]);
    expect(el.querySelector('app-landing-demo')).toBeTruthy();
    const sections = Array.from(el.querySelectorAll('section')).map((s) => s.className);
    expect(sections.indexOf('lp-section lp-editor')).toBeGreaterThan(0);
  });

  it("drops the Who's Hot card when the build switches the page off", async () => {
    environment.whosHotEnabled = false;
    const el = await render();
    const titles = Array.from(el.querySelectorAll('.lp-feature-title')).map((t) =>
      t.textContent?.trim(),
    );
    expect(titles).not.toContain("Who's Hot");
  });

  it('sells the AI projection only where the BFF serves it', async () => {
    const served = await render(true);
    expect(served.querySelector('.lp-premium')).toBeTruthy();
    expect(served.querySelector('.lp-premium')?.textContent).toContain('See Premium');

    const unserved = await render(false);
    expect(unserved.querySelector('.lp-premium')).toBeNull();
  });
});
