import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { LandingDemoComponent } from './landing-demo';
import { FullSeasonDialogComponent } from '../../draft-projection/full-season-dialog/full-season-dialog';
import { PlayerProjectionsTableComponent } from '../../draft-projection/player-projections-table/player-projections-table';
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
      .mock(FullSeasonDialogComponent)
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

  it('offers the full-season scaling the editor offers, dialog and all', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const table = ngMocks.find(PlayerProjectionsTableComponent);
    expect(ngMocks.input(table, 'showFullSeasonButton')).toBe(true);
    expect(fixture.nativeElement.querySelector('app-full-season-dialog')).toBeNull();

    ngMocks.output(table, 'fullSeasonRequested').emit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-full-season-dialog')).not.toBeNull();
  });

  it('includes the off-season player-data notice', async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-offseason-data-notice')).not.toBeNull();
  });

  // The editor keeps its settings in the table's own toolbar and header menus, so the demo has
  // to hand the table the same controls — otherwise the landing page advertises a screen the
  // product no longer has.
  it("gives the table the editor's column and league controls", async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const table = ngMocks.find(PlayerProjectionsTableComponent);
    expect(ngMocks.input(table, 'columnControls')).toBe(true);
    expect(fixture.nativeElement.querySelector('app-projection-settings-section')).toBeNull();
  });

  it("offers the league import behind sign-in, in the editor's toolbar slot", async () => {
    const fixture = MockRender(LandingDemoComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const importLink: HTMLAnchorElement | null =
      fixture.nativeElement.querySelector('.demo-import');
    expect(importLink).not.toBeNull();
    expect(importLink!.textContent).toContain('Import league');
    expect(importLink!.getAttribute('routerLink')).toEqual('/register');
    expect(importLink!.hasAttribute('table-toolbar-actions')).toBe(true);
  });

  it('hides the import call to action when no platform can be synced', async () => {
    const originalEspn = environment.espnLeaguesEnabled;
    environment.yahooSyncDisabled = true;
    environment.espnLeaguesEnabled = false;
    try {
      const fixture = MockRender(LandingDemoComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      // Same behaviour as app-league-sync in the signed-in editor: with nothing to sync the
      // button is absent rather than advertising a dead end.
      expect(fixture.nativeElement.querySelector('.demo-import')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Import league');
    } finally {
      environment.yahooSyncDisabled = false;
      environment.espnLeaguesEnabled = originalEspn;
    }
  });

  it('keeps the import while ESPN is still syncable, even with Yahoo off', async () => {
    const originalEspn = environment.espnLeaguesEnabled;
    environment.yahooSyncDisabled = true;
    environment.espnLeaguesEnabled = true;
    try {
      const fixture = MockRender(LandingDemoComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      const importLink = fixture.nativeElement.querySelector('.demo-import');
      expect(importLink).not.toBeNull();
      // Naming Yahoo here would advertise a sync the editor doesn't offer.
      expect(fixture.point.componentInstance['syncablePlatforms']).toEqual('ESPN');
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
