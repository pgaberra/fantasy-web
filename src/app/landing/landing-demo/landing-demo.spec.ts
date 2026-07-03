import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { LandingDemoComponent } from './landing-demo';
import { PlayerProjectionsTableComponent } from '../../draft-projection/player-projections-table/player-projections-table';
import { StatInfoService } from '../../services/stat-info.service';
import { DEMO_PLAYERS } from '../demo-players';

describe('LandingDemoComponent', () => {
  beforeEach(() =>
    MockBuilder(LandingDemoComponent).mock(PlayerProjectionsTableComponent).keep(StatInfoService),
  );

  it('defaults to category scoring and feeds the demo players to the table', () => {
    const component = MockRender(LandingDemoComponent).point.componentInstance;

    expect(component.scoringType()).toEqual('category');
    expect(component.players.length).toEqual(DEMO_PLAYERS.length);
    expect(component.activeColumns.scoring.size).toBeGreaterThan(0);
  });

  it('switches the scoring type via the segmented control', () => {
    const fixture = MockRender(LandingDemoComponent);
    const component = fixture.point.componentInstance;

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.demo-seg'),
    );
    const pointsButton = buttons.find((button) => button.textContent?.trim() === 'Points');
    pointsButton?.click();

    expect(component.scoringType()).toEqual('points');
  });

  it('shows a save-projection call to action', () => {
    const fixture = MockRender(LandingDemoComponent);
    expect(fixture.nativeElement.textContent).toContain('Save projection');
  });
});
