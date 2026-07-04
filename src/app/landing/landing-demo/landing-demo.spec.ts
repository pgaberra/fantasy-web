import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { LandingDemoComponent } from './landing-demo';
import { PlayerProjectionsTableComponent } from '../../draft-projection/player-projections-table/player-projections-table';
import { ProjectionSettingsSectionComponent } from '../../draft-projection/projection-settings-section/projection-settings-section';
import { StatInfoService } from '../../services/stat-info.service';
import { DEMO_PLAYERS } from '../demo-players';
import {
  DEFAULT_SCORING_COLUMNS,
  DEFAULT_UTILITY_COLUMNS,
} from '../../draft-projection/projection-defaults';

describe('LandingDemoComponent', () => {
  beforeEach(() =>
    MockBuilder(LandingDemoComponent)
      .mock(PlayerProjectionsTableComponent)
      .mock(ProjectionSettingsSectionComponent)
      .keep(StatInfoService),
  );

  it('mirrors the signed-in editor state: demo players and the real default columns', () => {
    const component = MockRender(LandingDemoComponent).point.componentInstance;

    expect(component.scoringType()).toEqual('category');
    expect(component.players.length).toEqual(DEMO_PLAYERS.length);
    expect(component.activeColumns().scoring.size).toEqual(DEFAULT_SCORING_COLUMNS.length);
    expect(component.activeColumns().utility.size).toEqual(DEFAULT_UTILITY_COLUMNS.length);
  });

  it('shows the save-projection call to action', () => {
    const fixture = MockRender(LandingDemoComponent);
    expect(fixture.nativeElement.textContent).toContain('Save projection');
  });

  it('shows the Yahoo sync gated behind sign-in', () => {
    const fixture = MockRender(LandingDemoComponent);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Sync your Yahoo league');
    expect(text).toContain('Sign in to connect Yahoo');
  });
});
