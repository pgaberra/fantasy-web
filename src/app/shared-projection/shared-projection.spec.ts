import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SharedProjectionComponent } from './shared-projection';
import { PlayerRowComponent } from '../draft-projection/player-projections-table/player-row/player-row';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { SharedProjectionResponse } from '../api/models/shared-projection-response';

describe('SharedProjectionComponent', () => {
  const shared: SharedProjectionResponse = {
    token: 'abc123',
    name: 'My league',
    authorUsername: 'alex',
    season: '20262027',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-02T10:00:00Z',
    totalPlayers: 2,
    truncated: false,
    data: {
      settings: {
        scoringType: 'points',
        statWeights: { goals: 4.5 },
        activeScoringColumns: ['goals', 'assists'],
        activeUtilityColumns: ['gp'],
        scaleSettings: {},
        decimalSettings: { goals: 0, assists: 0 },
        useDefaultDecimals: true,
        leagueSize: 12,
      },
      players: [
        {
          playerId: 1,
          name: 'Connor McDavid',
          teamAbbrev: 'EDM',
          positions: ['C'],
          headshot: 'https://example.test/mcdavid.png',
          type: 'skater',
          rank: 1,
          value: 412.5,
          stats: { utility: { gp: 82 }, scoring: { goals: 64, assists: 89 } },
        },
        {
          playerId: 101,
          name: 'Igor Shesterkin',
          teamAbbrev: 'NYR',
          type: 'goalie',
          rank: 2,
          value: 301.2,
          stats: { utility: { gp: 58 }, scoring: { w: 36 } },
        },
      ],
    },
  };

  const loadShared = vi.fn(() => of(shared));
  const importFromShare = vi.fn();
  const navigate = vi.fn();
  const notifyError = vi.fn();
  const isLoggedIn = signal(false);

  beforeEach(() => {
    loadShared.mockClear();
    loadShared.mockReturnValue(of(shared));
    importFromShare.mockClear();
    importFromShare.mockReturnValue(of({ id: 'copy1' }));
    navigate.mockClear();
    notifyError.mockClear();
    isLoggedIn.set(false);
    return (
      MockBuilder(SharedProjectionComponent)
        // Kept real: the point of this page is that it renders the editor's own row, so a mocked
        // stand-in would test nothing.
        .keep(PlayerRowComponent)
        .mock(ProjectionShareService, { loadShared })
        .mock(ProjectionStorageService, { importFromShare })
        .mock(NotificationService, { error: notifyError })
        .provide({ provide: AuthService, useValue: { isLoggedIn } })
        .provide({ provide: Router, useValue: { navigate } })
        .provide({
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'abc123' } } },
        })
    );
  });

  const render = async () => {
    const fixture = MockRender(SharedProjectionComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  it('renders the published rows in the order they were shared', async () => {
    const fixture = MockRender(SharedProjectionComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.point.componentInstance;
    expect(component.visibleRows().map((row) => row.player.name)).toEqual([
      'Connor McDavid',
      'Igor Shesterkin',
    ]);
    expect(fixture.nativeElement.querySelector('app-player-headshot img')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Connor McDavid');
  });

  it('carries the headshot into the row, so the page looks like the editor', async () => {
    const fixture = MockRender(SharedProjectionComponent);
    await fixture.whenStable();

    expect(fixture.point.componentInstance.visibleRows()[0].player.headshot).toEqual(
      'https://example.test/mcdavid.png',
    );
  });

  it('renders the published value rather than recomputing it', async () => {
    const fixture = MockRender(SharedProjectionComponent);
    await fixture.whenStable();

    const [first] = fixture.point.componentInstance.visibleRows();
    expect(first.score.fantasyPoints).toEqual(412.5);
    expect(first.score.zScore).toEqual(412.5);
  });

  it('filters by position without touching the published order', async () => {
    const fixture = MockRender(SharedProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.positionFilter.set('G');

    expect(component.visibleRows().map((row) => row.player.name)).toEqual(['Igor Shesterkin']);
  });

  it('sorts by a stat column when its header is clicked', async () => {
    const fixture = MockRender(SharedProjectionComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.onSort('goals');

    expect(component.visibleRows().map((row) => row.player.name)).toEqual([
      'Connor McDavid',
      'Igor Shesterkin',
    ]);
    expect(component.sortColumn()).toEqual('goals');
  });

  it("credits the owner's username", async () => {
    const fixture = MockRender(SharedProjectionComponent);
    await fixture.whenStable();

    expect(fixture.point.componentInstance.authorLabel()).toEqual('alex');
  });

  it('treats a withdrawn link as gone rather than as a failure to retry', async () => {
    loadShared.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );

    const fixture = MockRender(SharedProjectionComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.point.componentInstance.isGone()).toEqual(true);
    expect(fixture.nativeElement.textContent).toContain("This link isn't active");
  });

  describe('paging through a long board', () => {
    /** A real board is the owner's whole pool; 2 rows say nothing about what 1600 do. */
    const long: SharedProjectionResponse = {
      ...shared,
      totalPlayers: 400,
      data: {
        ...shared.data,
        players: Array.from({ length: 400 }, (_, index) => ({
          playerId: 1000 + index,
          name: `Skater ${index}`,
          teamAbbrev: 'EDM',
          positions: index % 2 === 0 ? ['C'] : ['D'],
          type: 'skater' as const,
          rank: index + 1,
          value: 400 - index,
          stats: { utility: { gp: 82 }, scoring: { goals: 400 - index, assists: index } },
        })),
      },
    };

    beforeEach(() => {
      loadShared.mockReturnValue(of(long));
    });

    it('opens on the top 50 rather than the whole board', async () => {
      const fixture = await render();
      const component = fixture.point.componentInstance;

      expect(component.visibleRows().length).toEqual(50);
      expect(component.visibleRows()[0].player.name).toEqual('Skater 0');
      expect(component.matchingCount()).toEqual(400);
      expect(fixture.nativeElement.textContent).toContain('Showing 50 of 400');
    });

    it('reveals another 100 on each click of Show more', async () => {
      const fixture = await render();
      const component = fixture.point.componentInstance;

      component.showMore();
      expect(component.visibleRows().length).toEqual(150);

      component.showMore();
      expect(component.visibleRows().length).toEqual(250);
    });

    it('stops offering Show more once the last row is on screen', async () => {
      const fixture = await render();
      const component = fixture.point.componentInstance;

      component.visibleCount.set(400);
      fixture.detectChanges();

      expect(component.hasMore()).toEqual(false);
      expect(fixture.nativeElement.textContent).not.toContain('Show more');
      expect(fixture.nativeElement.textContent).toContain('Showing 400 of 400');
    });

    it('goes back to the top 50 when the filter or the sort changes', async () => {
      const fixture = await render();
      const component = fixture.point.componentInstance;

      component.showMore();
      component.positionFilter.set('D');
      expect(component.visibleRows().length).toEqual(50);
      expect(component.matchingCount()).toEqual(200);

      component.showMore();
      component.onSort('goals');
      expect(component.visibleRows().length).toEqual(50);
    });
  });

  /**
   * The gate cuts the board before the browser sees it, so a column heading behind it is a
   * question only the server can answer. These check that it is asked — and asked again when the
   * question changes — rather than the 25 rows on hand being re-sorted into a different answer.
   */
  describe('ordering a board that arrived cut', () => {
    it('asks for the board in the order it is showing', async () => {
      await render();

      expect(loadShared).toHaveBeenCalledWith('abc123', {
        position: 'ALL',
        sort: 'summary',
        direction: 'desc',
      });
    });

    it('asks again when a column is sorted', async () => {
      const fixture = await render();

      fixture.point.componentInstance.onSort('goals');
      await fixture.whenStable();

      expect(loadShared).toHaveBeenLastCalledWith('abc123', {
        position: 'ALL',
        sort: 'goals',
        direction: 'desc',
      });
    });

    it('asks again when the position filter changes', async () => {
      const fixture = await render();

      fixture.point.componentInstance.positionFilter.set('D');
      await fixture.whenStable();

      expect(loadShared).toHaveBeenLastCalledWith('abc123', {
        position: 'D',
        sort: 'summary',
        direction: 'desc',
      });
    });

    it('keeps the rows on screen while the new order is on its way', async () => {
      const fixture = await render();
      const component = fixture.point.componentInstance;
      const pending = new Subject<SharedProjectionResponse>();
      loadShared.mockReturnValue(pending);

      // Not whenStable(): a request in flight is a pending task, and waiting on it would wait
      // out the very state under test. detectChanges() flushes the resource's effect instead.
      component.onSort('goals');
      fixture.detectChanges();

      expect(component.shared()).toBeDefined();
      expect(component.isReordering()).toEqual(true);
      expect(fixture.nativeElement.textContent).toContain('Connor McDavid');
      expect(fixture.nativeElement.querySelector('app-loading-indicator')).toBeNull();

      pending.next({ ...shared, data: { ...shared.data, players: [shared.data.players[1]] } });
      pending.complete();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.isReordering()).toEqual(false);
      expect(component.visibleRows().map((row) => row.player.name)).toEqual(['Igor Shesterkin']);
    });

    it('leaves a reader who holds the whole board to sort it in the browser', async () => {
      isLoggedIn.set(true);
      const fixture = await render();

      expect(loadShared).toHaveBeenCalledWith('abc123', undefined);

      fixture.point.componentInstance.onSort('goals');
      await fixture.whenStable();

      expect(loadShared).toHaveBeenCalledOnce();
    });
  });

  describe('drafting against a shared board', () => {
    it('offers a signed-out visitor the sign-up rather than a copy', async () => {
      const fixture = await render();

      expect(fixture.nativeElement.textContent).toContain('Make your own projection');
      expect(fixture.nativeElement.textContent).not.toContain('Draft against this board');
    });
  });

  describe('the sign-in gate', () => {
    /** What the BFF sent is all there is — the withheld rows never reach the browser. */
    const truncated = { ...shared, totalPlayers: 1489, truncated: true };

    it('asks a signed-out visitor to sign in, and says what they are missing', async () => {
      loadShared.mockReturnValue(of(truncated));
      const fixture = await render();

      expect(fixture.nativeElement.textContent).toContain('This link opens the top 2 of 1489');
      expect(fixture.nativeElement.textContent).not.toContain('Make your own projection');
    });

    /** The footer counts rows on screen, the gate counts the board — they sat side by side saying
        different things about "the top N", which read as one of them being wrong. */
    it('names the board while the footer names the page, without the two clashing', async () => {
      loadShared.mockReturnValue(
        of({
          ...shared,
          totalPlayers: 1489,
          truncated: true,
          data: {
            ...shared.data,
            players: Array.from({ length: 100 }, (_, index) => ({
              playerId: 2000 + index,
              name: `Skater ${index}`,
              teamAbbrev: 'EDM',
              positions: ['C'],
              type: 'skater' as const,
              rank: index + 1,
              value: 100 - index,
              stats: { utility: { gp: 82 }, scoring: { goals: 100 - index, assists: index } },
            })),
          },
        }),
      );
      const fixture = await render();

      expect(fixture.nativeElement.textContent).toContain('Showing 50 of 100');
      expect(fixture.nativeElement.textContent).toContain('This link opens the top 100 of 1489');
    });

    it('sends them back to this board once they have signed in', async () => {
      loadShared.mockReturnValue(of(truncated));
      await render();

      const login = ngMocks.get(ngMocks.find('[data-testid="gate-login"]'), RouterLink);
      const register = ngMocks.get(ngMocks.find('[data-testid="gate-register"]'), RouterLink);
      expect(login.routerLink).toEqual('/login');
      expect(login.queryParams).toEqual({ returnUrl: '/s/abc123' });
      expect(register.routerLink).toEqual('/register');
      expect(register.queryParams).toEqual({ returnUrl: '/s/abc123' });
    });

    it('does not claim rows are missing when the whole board came back', async () => {
      const fixture = await render();

      expect(fixture.nativeElement.textContent).not.toContain('This link opens the top');
      expect(fixture.nativeElement.textContent).toContain('Make your own projection');
    });

    it('offers a signed-in reader the copy, not the gate', async () => {
      isLoggedIn.set(true);
      loadShared.mockReturnValue(of({ ...shared, totalPlayers: 1489 }));
      const fixture = await render();

      expect(fixture.nativeElement.textContent).toContain('Draft against');
      expect(fixture.nativeElement.textContent).not.toContain('This link opens the top');
    });

    it('copies the board and opens a draft against it', async () => {
      isLoggedIn.set(true);
      const fixture = await render();

      fixture.point.componentInstance.draftAgainstThis();

      expect(importFromShare).toHaveBeenCalledWith('abc123');
      expect(navigate).toHaveBeenCalledWith(['/projections', 'copy1', 'draft']);
    });

    /** A clash on the shared name means this same board is already in their account. */
    it('points at Draft Mode when the board is already imported', async () => {
      isLoggedIn.set(true);
      importFromShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      const fixture = await render();

      fixture.point.componentInstance.draftAgainstThis();

      expect(fixture.point.componentInstance.alreadyImported()).toEqual(true);
      expect(navigate).not.toHaveBeenCalled();
      expect(notifyError).not.toHaveBeenCalled();
    });

    it('surfaces any other failure and lets them try again', async () => {
      isLoggedIn.set(true);
      importFromShare.mockReturnValue(throwError(() => new Error('boom')));
      const fixture = await render();

      fixture.point.componentInstance.draftAgainstThis();

      expect(notifyError).toHaveBeenCalledOnce();
      expect(fixture.point.componentInstance.isImporting()).toEqual(false);
    });
  });
});
