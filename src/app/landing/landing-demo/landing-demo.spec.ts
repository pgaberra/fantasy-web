import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { LandingDemoComponent } from './landing-demo';
import { PlayerProjectionsTableComponent } from '../../draft-projection/player-projections-table/player-projections-table';
import { ProjectionSettingsSectionComponent } from '../../draft-projection/projection-settings-section/projection-settings-section';
import { PlayerService } from '../../services/player.service';
import { StatInfoService } from '../../services/stat-info.service';
import { PendingProjectionService } from '../../services/pending-projection.service';
import { ProjectionSerializerService } from '../../services/projection-serializer.service';
import { Player } from '../../models/player.model';
import { SkaterStats } from '../../models/projection.model';
import { ScoringStatKey } from '../../models/stat-key.model';
import { DEFAULT_SCORING_COLUMNS } from '../../draft-projection/projection-defaults';
import { environment } from '../../../environments/environment';

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
  const stash = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    getPlayers.mockClear();
    stash.mockClear();
    navigate.mockClear();
    getPlayers.mockReturnValue(of(players));
    return MockBuilder(LandingDemoComponent)
      .mock(PlayerProjectionsTableComponent)
      .mock(ProjectionSettingsSectionComponent)
      .mock(PlayerService, { getPlayers })
      .mock(PendingProjectionService, { stash })
      .keep(StatInfoService)
      .keep(ProjectionSerializerService)
      .provide({ provide: Router, useValue: { navigate } });
  });

  it('loads the real player pool and mirrors the editor defaults', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();

    const component = fixture.point.componentInstance;
    expect(component.players()).toEqual(players);
    expect(component.scoringType()).toEqual('points');
    expect(component.activeScoringColumns().size).toEqual(DEFAULT_SCORING_COLUMNS.length);
  });

  it('takes a column picked in the table as its own', async () => {
    // The demo is the real editor, so the table owns the column menus and hands the choice back.
    // Passing the columns down without taking the change back gives a table whose own menus
    // cannot move it.
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const table = ngMocks.find(fixture, PlayerProjectionsTableComponent);
    ngMocks
      .output(table, 'activeScoringColumnsChange')
      .emit(new Set<ScoringStatKey>(['goals', 'hits']));
    fixture.detectChanges();

    expect([...fixture.point.componentInstance.activeScoringColumns()]).toEqual(['goals', 'hits']);
  });

  // The BFF still hands over the whole pool — the editor needs it to rank and score — but the
  // demo only renders the top of it, so the rest of the board is what signing up is for.
  it('renders only the top 50 players while still holding the full pool', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const table = ngMocks.find(PlayerProjectionsTableComponent);
    expect(ngMocks.input(table, 'maxVisiblePlayers')).toEqual(50);
    expect(ngMocks.input(table, 'players')).toEqual(players);
  });

  it('shows the save-projection call to action once loaded', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Save projection');
  });

  it('stashes the edited projection before sending the visitor to register', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const component = fixture.point.componentInstance;
    component.scoringType.set('category');
    component.leagueSize.set(14);

    component.saveProjection();

    expect(stash).toHaveBeenCalledOnce();
    const stashed = stash.mock.calls[0][0];
    expect(stashed.settings.scoringType).toEqual('category');
    expect(stashed.settings.leagueSize).toEqual(14);
    expect(navigate).toHaveBeenCalledWith(['/register']);
  });

  it('includes the off-season player-data notice', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-offseason-data-notice')).not.toBeNull();
  });

  it('shows the Yahoo sync gated behind sign-in', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Sync your Yahoo league');
    expect(text).toContain('Sign in to connect Yahoo');
  });

  it('hides the sync teaser entirely when no platform can be synced', async () => {
    const originalEspn = environment.espnLeaguesEnabled;
    environment.yahooSyncDisabled = true;
    environment.espnLeaguesEnabled = false;
    try {
      const fixture = MockRender(LandingDemoComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      // Same behaviour as app-league-sync in the signed-in editor: with nothing to sync the
      // section is absent rather than advertising a dead end behind a disabled button.
      expect(fixture.nativeElement.querySelector('.demo-yahoo-gate')).toBeNull();
      const text = fixture.nativeElement.textContent;
      expect(text).not.toContain('Sync your Yahoo league');
      expect(text).not.toContain('Sign in to connect Yahoo');
    } finally {
      environment.yahooSyncDisabled = false;
      environment.espnLeaguesEnabled = originalEspn;
    }
  });

  it('keeps the teaser while ESPN is still syncable, even with Yahoo off', async () => {
    const originalEspn = environment.espnLeaguesEnabled;
    environment.yahooSyncDisabled = true;
    environment.espnLeaguesEnabled = true;
    try {
      const fixture = MockRender(LandingDemoComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.demo-yahoo-gate')).not.toBeNull();
      // Naming Yahoo here would advertise a sync the editor doesn't offer.
      expect(fixture.nativeElement.textContent).toContain('Sync your ESPN league');
      expect(fixture.nativeElement.textContent).not.toContain('Yahoo league');
    } finally {
      environment.yahooSyncDisabled = false;
      environment.espnLeaguesEnabled = originalEspn;
    }
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
