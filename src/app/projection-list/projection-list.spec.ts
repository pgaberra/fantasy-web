import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { ProjectionListComponent } from './projection-list';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
import { PendingProjectionService } from '../services/pending-projection.service';
import { ProjectionSummaryResponse } from '../api/models/projection-summary-response';
import { ProjectionData } from '../api/models/projection-data';
import { PlayerService } from '../services/player.service';
import { ProjectionShareService } from '../services/projection-share.service';
import { SkaterStats } from '../models/projection.model';
import { HttpErrorResponse } from '@angular/common/http';
import { renameOnOpenExtras } from '../draft-projection/rename-intent';

describe('ProjectionListComponent', () => {
  const summaries: ProjectionSummaryResponse[] = [
    {
      id: 'p1',
      kind: 'projection',
      name: 'My league',
      draftStatus: 'none',
      season: '20262027',
      autoNamed: false,
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
    },
    {
      id: 'p2',
      kind: 'projection',
      name: 'Newest league',
      draftStatus: 'none',
      season: '20262027',
      autoNamed: false,
      createdAt: '2026-06-02T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
    },
    {
      id: 'p3',
      kind: 'projection',
      name: 'Middle league',
      draftStatus: 'none',
      season: '20262027',
      autoNamed: false,
      createdAt: '2026-06-03T00:00:00Z',
      updatedAt: '2026-06-05T00:00:00Z',
    },
  ];

  const demoData: ProjectionData = {
    settings: {
      scoringType: 'points',
      statWeights: { goals: 5 },
      activeScoringColumns: ['goals'],
      activeUtilityColumns: ['gp'],
      scaleSettings: {},
      decimalSettings: { goals: 0 },
      useDefaultDecimals: true,
    },
    players: [
      {
        playerId: 1,
        type: 'skater',
        stats: {
          utility: { gp: 82 },
          scoring: {
            stpg: 0,
            stpa: 0,
            stp: 0,
            hatTricks: 0,
            defPoints: 0,
            shifts: 0,
            toi: 0,
            goals: 60,
          },
        },
      },
    ],
  };

  const navigate = vi.fn();
  const listEditable = vi.fn(() => of(summaries));
  const deleteProjection = vi.fn(() => of(undefined));
  const createProjection = vi.fn();
  const notifyError = vi.fn();
  const peek = vi.fn();
  const loadProjection = vi.fn();
  const getPlayers = vi.fn();
  const rowsToPublish = vi.fn();
  const copyFromShare = vi.fn();
  const clearPending = vi.fn();

  beforeEach(() => {
    navigate.mockClear();
    listEditable.mockClear();
    deleteProjection.mockClear();
    createProjection.mockClear();
    notifyError.mockClear();
    peek.mockClear();
    clearPending.mockClear();
    listEditable.mockReturnValue(of(summaries));
    deleteProjection.mockReturnValue(of(undefined));
    peek.mockReturnValue(null);
    loadProjection.mockReturnValue(of({ id: 'p1', name: 'My league', data: demoData }));
    getPlayers.mockReturnValue(
      of([
        {
          id: 1,
          type: 'skater',
          name: 'McDavid',
          positions: new Set(['C']),
          stats: {} as SkaterStats,
        },
      ]),
    );
    rowsToPublish.mockReturnValue([]);
    copyFromShare.mockClear();
    copyFromShare.mockReturnValue(of({ id: 'copy9', name: 'Copy of Alex league' }));
    return MockBuilder(ProjectionListComponent)
      .mock(ProjectionStorageService, {
        listEditable,
        deleteProjection,
        createProjection,
        loadProjection,
        copyFromShare,
      })
      .mock(PlayerService, { getPlayers })
      .mock(ProjectionShareService, { rowsToPublish })
      .mock(NotificationService, { error: notifyError })
      .mock(PendingProjectionService, { peek, clear: clearPending })
      .provide({ provide: Router, useValue: { navigate } });
  });

  /**
   * A follow and a spreadsheet import are both `kind: 'imported'`; a copy of a shared
   * projection is the user's own and comes back as `kind: 'projection'`. The page groups on
   * that, so a copy sits with their own work and the follow with the imports.
   */
  describe('the two groups', () => {
    const follow: ProjectionSummaryResponse = {
      id: 'f1',
      kind: 'imported',
      name: "Alex's league",
      draftStatus: 'none',
      season: '20262027',
      createdAt: '2026-06-04T00:00:00Z',
      updatedAt: '2026-06-08T00:00:00Z',
      autoNamed: false,
      origin: { authorUsername: 'alex', shareToken: 'tok123' },
    };
    const fromSheet: ProjectionSummaryResponse = {
      ...follow,
      id: 's1',
      name: 'My spreadsheet',
      updatedAt: '2026-06-09T00:00:00Z',
      origin: undefined,
    };

    const renderWithImports = async () => {
      listEditable.mockReturnValue(of([...summaries, follow, fromSheet]));
      const fixture = MockRender(ProjectionListComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    };

    /**
     * The split is ownership, not how a row arrived: a spreadsheet the user uploaded is theirs
     * to edit and share, so it belongs with what they made rather than with what they follow.
     */
    it('keeps what they follow apart from their own work, newest first in each', async () => {
      const component = (await renderWithImports()).point.componentInstance;

      expect(component.ownProjections().map((row) => row.id)).toEqual(['p2', 's1', 'p3', 'p1']);
      expect(component.followedProjections().map((row) => row.id)).toEqual(['f1']);
    });

    it('heads each group', async () => {
      const fixture = await renderWithImports();

      const headings = Array.from(
        fixture.nativeElement.querySelectorAll('.group-heading') as NodeListOf<HTMLElement>,
      ).map((heading) => heading.textContent?.trim());
      expect(headings).toEqual(['Your projections', 'Following']);
    });

    /** A heading with nothing under it says less than no heading. */
    it('leaves out a group that holds nothing', async () => {
      const fixture = MockRender(ProjectionListComponent);
      await fixture.whenStable();
      fixture.detectChanges();

      const headings = Array.from(
        fixture.nativeElement.querySelectorAll('.group-heading') as NodeListOf<HTMLElement>,
      ).map((heading) => heading.textContent?.trim());
      expect(headings).toEqual(['Your projections']);
    });

    it('copies a followed projection from its share token and opens it ready to be renamed', async () => {
      const component = (await renderWithImports()).point.componentInstance;

      component.createCopy(follow);
      await Promise.resolve();

      expect(copyFromShare).toHaveBeenCalledWith('tok123');
      expect(navigate).toHaveBeenCalledWith(['/projections', 'copy9'], renameOnOpenExtras);
    });

    it('says so when the link behind a follow has gone, and copies nothing', async () => {
      copyFromShare.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      const component = (await renderWithImports()).point.componentInstance;

      component.createCopy(follow);

      expect(notifyError).toHaveBeenCalledOnce();
      expect(component.copyingFollow()).toBeNull();
    });
  });

  it('loads the saved projections', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    const component = fixture.point.componentInstance;
    expect(component.projectionsResource.value()).toEqual(summaries);
    expect(component.projectionsResource.isLoading()).toEqual(false);
  });

  it('sorts the projections newest-updated first', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    const order = fixture.point.componentInstance
      .sortedProjections()
      .map((projection) => projection.id);
    expect(order).toEqual(['p2', 'p3', 'p1']);
  });

  it('navigates to the create page', () => {
    const component = MockRender(ProjectionListComponent).point.componentInstance;
    component.createNew();
    expect(navigate).toHaveBeenCalledWith(['/projections/new']);
  });

  it('navigates to edit an existing projection', () => {
    const component = MockRender(ProjectionListComponent).point.componentInstance;
    component.edit('p1');
    expect(navigate).toHaveBeenCalledWith(['/projections', 'p1']);
  });

  it('saves a projection carried over from the demo and opens it in the editor', async () => {
    listEditable.mockReturnValue(of([]));
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(of({ id: 'new1' }));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(createProjection).toHaveBeenCalledWith({ name: 'My Projection', data: demoData });
    expect(clearPending).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/projections', 'new1']);
  });

  /** Names are unique per user, so the demo's copy cannot reuse one an existing projection has. */
  it('saves the demo beside an existing projection, under a name that is free', async () => {
    listEditable.mockReturnValue(of([{ ...summaries[0], name: 'My Projection' }]));
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(of({ id: 'new1' }));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(createProjection).toHaveBeenCalledWith({ name: 'My Projection 2', data: demoData });
    expect(navigate).toHaveBeenCalledWith(['/projections', 'new1']);
  });

  // The carried-over board joins the same list an imported one is in, and one namespace covers
  // both, so it may not take a name an imported board already holds either.
  it('saves the demo under a name no imported board is using', async () => {
    listEditable.mockReturnValue(
      of([{ ...summaries[0], kind: 'imported' as const, name: 'My Projection' }]),
    );
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(of({ id: 'new1' }));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(createProjection).toHaveBeenCalledWith({ name: 'My Projection 2', data: demoData });
  });

  it('keeps the demo stash when saving it fails, so it can be retried', async () => {
    listEditable.mockReturnValue(of([]));
    peek.mockReturnValue(demoData);
    createProjection.mockReturnValue(throwError(() => new Error('bff down')));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    expect(clearPending).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
    expect(fixture.point.componentInstance.isSavingDemo()).toEqual(false);
  });

  it('shows the empty state when there are no saved projections', async () => {
    listEditable.mockReturnValue(of([]));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No projections yet');
  });

  it('enables the create button when there are no projections', async () => {
    listEditable.mockReturnValue(of([]));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.create-button');
    expect(button).not.toBeNull();
    expect(button.disabled).toEqual(false);
  });

  it('keeps the create button live once a projection exists — a user may keep several', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.create-button');
    expect(button).not.toBeNull();
    expect(button.disabled).toEqual(false);
  });

  it('reloads the list when retry is called', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listEditable).toHaveBeenCalledTimes(1);

    fixture.point.componentInstance.retry();
    await fixture.whenStable();

    expect(listEditable).toHaveBeenCalledTimes(2);
  });

  it('reloads the list after a delete', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listEditable).toHaveBeenCalledTimes(1);

    await fixture.point.componentInstance.remove('p1');
    await fixture.whenStable();

    expect(deleteProjection).toHaveBeenCalledWith('p1');
    expect(listEditable).toHaveBeenCalledTimes(2);
  });

  it('notifies the user and keeps the list when a delete fails', async () => {
    deleteProjection.mockReturnValueOnce(throwError(() => new Error('network down')));
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    expect(listEditable).toHaveBeenCalledTimes(1);

    await fixture.point.componentInstance.remove('p1');
    await fixture.whenStable();

    expect(notifyError).toHaveBeenCalledOnce();
    expect(listEditable).toHaveBeenCalledTimes(1);
  });

  it('opens sharing straight from the list, without visiting the projection', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.share('p1');
    await fixture.whenStable();

    expect(loadProjection).toHaveBeenCalledWith('p1');
    expect(getPlayers).toHaveBeenCalled();
    expect(component.sharingProjectionId()).toEqual('p1');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ranks the projection before opening, since a share publishes ranked rows', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.share('p1');
    await fixture.whenStable();

    expect(rowsToPublish).toHaveBeenCalled();
  });

  it('surfaces a failure to prepare the share instead of opening an empty dialog', async () => {
    loadProjection.mockReturnValue(throwError(() => new Error('boom')));

    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();
    const component = fixture.point.componentInstance;

    component.share('p1');
    await fixture.whenStable();

    expect(component.sharingProjectionId()).toBeNull();
    expect(component.preparingShareFor()).toBeNull();
    expect(notifyError).toHaveBeenCalled();
  });

  /**
   * A board is not limited to one draft any more, so the card starts a new one every time and
   * the drafts themselves are listed, resumed and thrown away on the draft page.
   */
  it('starts a new draft against the board rather than resuming one', async () => {
    const fixture = MockRender(ProjectionListComponent);
    await fixture.whenStable();

    fixture.point.componentInstance.draft('p1');

    expect(navigate).toHaveBeenCalledWith(['/draft/new/board', 'p1']);
  });
});
