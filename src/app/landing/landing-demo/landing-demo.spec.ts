import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { LandingDemoComponent } from './landing-demo';
import { PlayerProjectionsTableComponent } from '../../draft-projection/player-projections-table/player-projections-table';
import { ProjectionSettingsSectionComponent } from '../../draft-projection/projection-settings-section/projection-settings-section';
import { PlayerService } from '../../services/player.service';
import { StatInfoService } from '../../services/stat-info.service';
import { Player } from '../../models/player.model';
import { SkaterStats } from '../../models/projection.model';
import { DEFAULT_SCORING_COLUMNS } from '../../draft-projection/projection-defaults';

describe('LandingDemoComponent', () => {
  const players: Player[] = [
    {
      id: 1,
      type: 'skater',
      name: 'Connor McDavid',
      teamAbbrev: 'EDM',
      positions: new Set(['C']),
      stats: {} as SkaterStats,
    },
  ];

  const getPlayers = vi.fn(() => of(players));

  beforeEach(() => {
    getPlayers.mockClear();
    getPlayers.mockReturnValue(of(players));
    return MockBuilder(LandingDemoComponent)
      .mock(PlayerProjectionsTableComponent)
      .mock(ProjectionSettingsSectionComponent)
      .mock(PlayerService, { getPlayers })
      .keep(StatInfoService);
  });

  it('loads the real player pool and mirrors the editor defaults', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();

    const component = fixture.point.componentInstance;
    expect(component.players()).toEqual(players);
    expect(component.scoringType()).toEqual('points');
    expect(component.activeColumns().scoring.size).toEqual(DEFAULT_SCORING_COLUMNS.length);
  });

  it('shows the save-projection call to action once loaded', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Save projection');
  });

  it('shows the Yahoo sync gated behind sign-in', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Sync your Yahoo league');
    expect(text).toContain('Sign in to connect Yahoo');
  });

  it('shows an error state with retry when the player load fails', async () => {
    getPlayers.mockReturnValue(throwError(() => new Error('bff down')));
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.point.componentInstance.playersResource.error()).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();

    getPlayers.mockReturnValue(of(players));
    fixture.point.componentInstance.retryLoad();
    await fixture.whenStable();

    expect(fixture.point.componentInstance.players()).toEqual(players);
  });
});
