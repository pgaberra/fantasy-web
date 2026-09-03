import { MockBuilder, MockedComponentFixture, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { SharedProjectionComponent } from './shared-projection';
import { PlayerRowComponent } from '../draft-projection/player-projections-table/player-row/player-row';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { SharedProjectionResponse } from '../api/models/shared-projection-response';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';

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
  const replaceState = vi.fn();
  const isLoggedIn = signal(false);
  /** The `action` a visitor carried back from the sign-in, as the URL would hold it. */
  let requestedAction: string | null = null;
  /**
   * Whether the board renders real rows. True everywhere the row itself is the subject; the
   * paging tests turn it off, because a board long enough to page through is also long enough
   * that building every row of it costs more than the rest of this file put together.
   */
  let realRows = true;

  beforeEach(() => {
    loadShared.mockClear();
    loadShared.mockReturnValue(of(shared));
    importFromShare.mockClear();
    importFromShare.mockReturnValue(of({ id: 'copy1' }));
    navigate.mockClear();
    notifyError.mockClear();
    replaceState.mockClear();
    isLoggedIn.set(false);
    requestedAction = null;
    // Kept real: the point of this page is that it renders the editor's own row, so a mocked
    // stand-in would test nothing — except where the rows are only there to be counted.
    const builder = realRows
      ? MockBuilder(SharedProjectionComponent).keep(PlayerRowComponent)
      : MockBuilder(SharedProjectionComponent).mock(PlayerRowComponent);
    return (
      builder
        // Kept real so the buttons' tooltips are the ones a reader would get, not a stand-in:
        // the labels alone no longer say a copy is taken.
        .keep(TooltipDirective)
        .mock(ProjectionShareService, { loadShared })
        .mock(ProjectionStorageService, { importFromShare })
        .mock(NotificationService, { error: notifyError })
        .provide({ provide: AuthService, useValue: { isLoggedIn } })
        .provide({ provide: Router, useValue: { navigate } })
        .provide({ provide: Location, useValue: { replaceState } })
        .provide({
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => 'abc123' },
              queryParamMap: { get: () => requestedAction },
            },
          },
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

    component.setPositionFilter('G');

    expect(component.visibleRows().map((row) => row.player.name)).toEqual(['Igor Shesterkin']);
  });

  /**
   * A published board ranks everyone together, so a reader who narrows it to one position is
   * looking at rows numbered 7, 10, 13 — the board's ranking, with the gaps left in. The editor
   * answers this by counting the position and keeping the board's number in brackets, and a
   * shared board says the same thing.
   */
  describe('narrowing to one position', () => {
    /**
     * Two left wings with a centre above them, so the position's ranks and the board's differ,
     * and a goalie at the foot of it, so there is something to see under the goalie filter.
     */
    const wingers: SharedProjectionResponse = {
      ...shared,
      totalPlayers: 4,
      data: {
        ...shared.data,
        settings: {
          ...shared.data.settings,
          activeScoringColumns: ['goals', 'assists', 'w'],
        },
        players: [
          shared.data.players[0],
          {
            playerId: 2,
            name: 'Jason Robertson',
            teamAbbrev: 'DAL',
            positions: ['LW'],
            type: 'skater' as const,
            rank: 2,
            value: 352.6,
            stats: { utility: { gp: 84 }, scoring: { goals: 35, assists: 47 } },
          },
          {
            playerId: 3,
            name: 'Kirill Kaprizov',
            teamAbbrev: 'MIN',
            positions: ['LW'],
            type: 'skater' as const,
            rank: 3,
            value: 325.9,
            stats: { utility: { gp: 70 }, scoring: { goals: 36, assists: 40 } },
          },
          { ...shared.data.players[1], rank: 4 },
        ],
      },
    };

    beforeEach(() => {
      loadShared.mockReturnValue(of(wingers));
    });

    it('counts the position from one, with the board rank in brackets', async () => {
      const fixture = await render();

      fixture.point.componentInstance.setPositionFilter('LW');
      fixture.detectChanges();

      const ranks = Array.from(
        fixture.nativeElement.querySelectorAll('tbody .col-rank') as NodeListOf<HTMLElement>,
      ).map((cell) => cell.textContent?.trim());
      expect(ranks).toEqual(['1 (2)', '2 (3)']);
    });

    it('shows the published rank alone while the whole board is on screen', async () => {
      const fixture = await render();

      const ranks = Array.from(
        fixture.nativeElement.querySelectorAll('tbody .col-rank') as NodeListOf<HTMLElement>,
      ).map((cell) => cell.textContent?.trim());
      expect(ranks).toEqual(['1', '2', '3', '4']);
    });

    it('counts off the published ranking, not the column being sorted', async () => {
      const fixture = await render();
      const component = fixture.point.componentInstance;

      component.setPositionFilter('LW');
      // Kaprizov outscores Robertson, so this puts the board's third row on top of the two.
      component.onSort('goals');
      fixture.detectChanges();

      const ranks = Array.from(
        fixture.nativeElement.querySelectorAll('tbody .col-rank') as NodeListOf<HTMLElement>,
      ).map((cell) => cell.textContent?.trim());
      expect(ranks).toEqual(['2 (3)', '1 (2)']);
    });

    /** The cells of the first row: rank, name, the columns on screen, and the value. */
    const firstRowCells = (fixture: MockedComponentFixture<SharedProjectionComponent>): number =>
      fixture.nativeElement.querySelectorAll('tbody tr:first-child td').length;

    it('drops the goalie columns when the filter leaves only skaters', async () => {
      const fixture = await render();

      fixture.point.componentInstance.setPositionFilter('LW');
      fixture.detectChanges();

      const columns = fixture.point.componentInstance.filteredActiveColumns();
      expect([...columns.scoring]).toEqual(['goals', 'assists']);
      expect([...columns.utility]).toEqual(['gp']);
      // Rank, name, GP, goals, assists, value: no column of dashes where the wins would be.
      expect(firstRowCells(fixture)).toEqual(6);
    });

    it('drops the skater columns when the filter leaves only goalies', async () => {
      const fixture = await render();

      fixture.point.componentInstance.setPositionFilter('G');
      fixture.detectChanges();

      const columns = fixture.point.componentInstance.filteredActiveColumns();
      expect([...columns.scoring]).toEqual(['w']);
      expect([...columns.utility]).toEqual(['gp']);
      // Rank, name, GP, wins, value.
      expect(firstRowCells(fixture)).toEqual(5);
    });

    it('falls back to the published order when the sorted column is filtered away', async () => {
      const fixture = await render();
      const component = fixture.point.componentInstance;

      component.onSort('w');
      component.setPositionFilter('LW');

      expect(component.sortColumn()).toEqual('summary');
      expect(component.sortDirection()).toEqual('desc');
    });

    it('keeps a sorted column the filter still shows', async () => {
      const fixture = await render();
      const component = fixture.point.componentInstance;

      component.onSort('goals');
      component.setPositionFilter('LW');

      expect(component.sortColumn()).toEqual('goals');
    });
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

    // Runs before the outer beforeEach builds the module for each of these tests, which is the
    // only place the choice can still be made.
    beforeAll(() => {
      realRows = false;
    });

    afterAll(() => {
      realRows = true;
    });

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
      component.setPositionFilter('D');
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

      fixture.point.componentInstance.setPositionFilter('D');
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

  describe('taking a copy of a shared board', () => {
    /** The offer is the same for everyone; what differs is what pressing it costs you first. */
    it('offers both to a visitor without an account too', async () => {
      const fixture = await render();

      expect(fixture.nativeElement.querySelector('[data-testid="copy-board"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="draft-board"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="sign-in-prompt"]')).toBeNull();
    });

    /**
     * The labels name where you end up; that a copy is taken — and that the owner's board is
     * untouched — is what the tooltip is for, since the note that used to say so is gone.
     */
    it('explains on each button that it takes a copy', async () => {
      const fixture = await render();

      for (const [testId, text] of [
        ['copy-board', 'Create your own projection from a copy of this one'],
        ['draft-board', 'Enter Draft mode with a copy of this projection'],
      ]) {
        const button = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
        button.dispatchEvent(new MouseEvent('mouseenter'));
        TestBed.inject(ApplicationRef).tick();

        expect(button.getAttribute('aria-describedby')).toBeTruthy();
        expect(document.querySelector('.cdk-overlay-container')?.textContent).toContain(text);

        button.dispatchEvent(new MouseEvent('mouseleave'));
        TestBed.inject(ApplicationRef).tick();
      }
    });

    it('asks a visitor without an account to sign in instead of copying', async () => {
      const fixture = await render();

      fixture.nativeElement.querySelector('[data-testid="draft-board"]').click();
      fixture.detectChanges();

      expect(importFromShare).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('to draft against it');
    });

    it('names what they were reaching for in the ask', async () => {
      const fixture = await render();

      fixture.nativeElement.querySelector('[data-testid="copy-board"]').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('to make it yours');
    });

    it('sends them back to this board once they have signed in from the ask', async () => {
      const fixture = await render();

      fixture.nativeElement.querySelector('[data-testid="draft-board"]').click();
      fixture.detectChanges();

      const login = ngMocks.get(ngMocks.find('[data-testid="prompt-login"]'), RouterLink);
      const register = ngMocks.get(ngMocks.find('[data-testid="prompt-register"]'), RouterLink);
      expect(login.routerLink).toEqual('/login');
      expect(login.queryParams).toEqual({ returnUrl: '/s/abc123?action=draft' });
      expect(register.routerLink).toEqual('/register');
      expect(register.queryParams).toEqual({ returnUrl: '/s/abc123?action=draft' });
    });

    /** Both offers are what the page is for, so neither is under a board to be scrolled past. */
    it('puts both offers above the table', async () => {
      isLoggedIn.set(true);
      const fixture = await render();

      const actions = fixture.nativeElement.querySelector('.board-actions');
      const table = fixture.nativeElement.querySelector('table');
      expect(actions).not.toBeNull();
      expect(
        actions.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="copy-board"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="draft-board"]')).not.toBeNull();
    });

    it('leaves a signed-in reader no card under the table to scroll to', async () => {
      isLoggedIn.set(true);
      const fixture = await render();

      expect(fixture.nativeElement.querySelector('.cta')).toBeNull();
    });

    it('copies the board and opens it for editing', async () => {
      isLoggedIn.set(true);
      const fixture = await render();

      fixture.nativeElement.querySelector('[data-testid="copy-board"]').click();

      expect(importFromShare).toHaveBeenCalledWith('abc123');
      expect(navigate).toHaveBeenCalledWith(['/projections', 'copy1']);
    });

    it('says which of the two is copying, and holds the other', async () => {
      isLoggedIn.set(true);
      importFromShare.mockReturnValue(new Subject());
      const fixture = await render();

      fixture.nativeElement.querySelector('[data-testid="draft-board"]').click();
      fixture.detectChanges();

      const copy = fixture.nativeElement.querySelector('[data-testid="copy-board"]');
      const draft = fixture.nativeElement.querySelector('[data-testid="draft-board"]');
      expect(draft.textContent).toContain('Copying…');
      expect(copy.textContent).toContain('Create projection');
      expect(copy.disabled).toEqual(true);
    });
  });

  /**
   * The press that was interrupted by the sign-in. It rides back on the return URL, so these are
   * as much about the copy not happening on sight as about it happening at all.
   */
  describe('coming back from the sign-in with the press still in hand', () => {
    it('drafts against the board without being asked twice', async () => {
      isLoggedIn.set(true);
      requestedAction = 'draft';

      await render();

      expect(importFromShare).toHaveBeenCalledWith('abc123');
      expect(navigate).toHaveBeenCalledWith(['/projections', 'copy1', 'draft']);
    });

    it('opens the copy for editing when that was the button', async () => {
      isLoggedIn.set(true);
      requestedAction = 'projection';

      await render();

      expect(navigate).toHaveBeenCalledWith(['/projections', 'copy1']);
    });

    /** A copy is something someone pressed a button for, not something a URL can ask for twice. */
    it('takes the action off the address bar before acting on it', async () => {
      isLoggedIn.set(true);
      requestedAction = 'draft';

      await render();

      expect(replaceState).toHaveBeenCalledWith('/s/abc123');
    });

    it('asks again rather than copying when the sign-in did not take', async () => {
      requestedAction = 'draft';

      const fixture = await render();

      expect(importFromShare).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[data-testid="sign-in-prompt"]')).not.toBeNull();
    });

    it('ignores an action it does not offer', async () => {
      isLoggedIn.set(true);
      requestedAction = 'delete-everything';

      const fixture = await render();

      expect(importFromShare).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[data-testid="sign-in-prompt"]')).toBeNull();
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

      expect(fixture.nativeElement.textContent).toContain('Draft mode');
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
    it('points at the copy they already have rather than making a second one', async () => {
      isLoggedIn.set(true);
      importFromShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      const fixture = await render();

      fixture.point.componentInstance.draftAgainstThis();
      fixture.detectChanges();

      expect(fixture.point.componentInstance.alreadyImported()).toEqual(true);
      expect(fixture.nativeElement.textContent).toContain('You already have a copy of this board');
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
