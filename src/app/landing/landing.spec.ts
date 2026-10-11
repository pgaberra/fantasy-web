import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';
import { LandingComponent } from './landing';
import { LandingDemoComponent } from './landing-demo/landing-demo';
import { LandingLineupComponent } from './landing-lineup/landing-lineup';
import { FeatureService } from '../services/feature.service';
import { environment } from '../../environments/environment';

describe('LandingComponent', () => {
  const originalWhosHot = environment.whosHotEnabled;
  const originalEspn = environment.espnLeaguesEnabled;

  afterEach(() => {
    environment.whosHotEnabled = originalWhosHot;
    environment.espnLeaguesEnabled = originalEspn;
    vi.restoreAllMocks();
  });

  async function render(aiProjection = true) {
    await MockBuilder(LandingComponent)
      .mock(LandingDemoComponent)
      .mock(LandingLineupComponent)
      .mock(FeatureService, { aiProjection: signal(aiProjection) })
      .provide(provideLocationMocks());
    const fixture = MockRender(LandingComponent);
    return fixture.nativeElement as HTMLElement;
  }

  it('leads with the scoring and the lineup, and never with a season', async () => {
    const el = await render();
    const text = el.textContent ?? '';

    expect(el.querySelector('h1')?.textContent).toContain('Your best lineup');
    expect(el.querySelector('app-landing-lineup')).toBeTruthy();
    // The page once named the season in its headline and went stale two weeks into it.
    expect(text).not.toMatch(/20\d\d-\d\d/);
    expect(text).not.toMatch(/upcoming|season is on|next NHL/i);
  });

  it('shows the in-season tools as panels, the editor and the draft tools', async () => {
    environment.whosHotEnabled = true;
    environment.espnLeaguesEnabled = true;
    const el = await render();

    const stages = Array.from(el.querySelectorAll('.lp-stage-title')).map((t) =>
      t.textContent?.trim(),
    );
    expect(stages).toEqual(['Streamer Planner', "Who's Hot", 'Team Power Rankings']);
    expect(el.querySelector('#editor app-landing-demo')).toBeTruthy();
    const draft = Array.from(el.querySelectorAll('.lp-draft-title')).map((t) =>
      t.textContent?.trim(),
    );
    expect(draft).toEqual([
      'Import your Yahoo or ESPN league',
      'Draft Mode',
      'Share with your league',
    ]);
    const jumps = Array.from(el.querySelectorAll('.lp-jump-link')).map((a) =>
      a.getAttribute('href'),
    );
    expect(jumps).toEqual(['#streamer-planner', '#whos-hot', '#team-power-rankings']);
  });

  it("drops Who's Hot when the build switches the page off", async () => {
    environment.whosHotEnabled = false;
    const el = await render();

    expect(el.querySelector('#whos-hot')).toBeNull();
    expect(el.textContent).not.toContain("Who's Hot");
  });

  it('sells Premium only where the BFF serves the AI projection', async () => {
    expect((await render(true)).querySelector('.lp-premium')).toBeTruthy();
    expect((await render(false)).querySelector('.lp-premium')).toBeNull();
  });

  it('labels every example panel as one', async () => {
    environment.whosHotEnabled = true;
    const el = await render();

    expect(el.querySelectorAll('.lp-panel').length).toBe(3);
    expect(el.querySelectorAll('.lp-panel .lp-example').length).toBe(3);
  });
});
