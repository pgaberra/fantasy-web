import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { DraftSummaryPageComponent } from './draft-summary-page';
import { DraftPlayerLookupService } from '../draft-player-lookup.service';
import { NotificationService } from '../../services/notification.service';
import { PlayerService } from '../../services/player.service';
import { ProjectionCalculationService } from '../../services/projection-calculation.service';
import { ProjectionRankingService } from '../../services/projection-ranking.service';
import { ProjectionSerializerService } from '../../services/projection-serializer.service';
import { ProjectionStorageService } from '../../services/projection-storage.service';
import { Player } from '../../models/player.model';
import { SkaterStats } from '../../models/projection.model';
import { ProjectionResponse } from '../../api/models/projection-response';

const players: Player[] = [
  { id: 1, type: 'skater', name: 'McDavid', positions: new Set(['C']), stats: {} as SkaterStats },
  { id: 2, type: 'skater', name: 'Makar', positions: new Set(['D']), stats: {} as SkaterStats },
];

const skater = (playerId: number, goals: number) => ({
  playerId,
  type: 'skater' as const,
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
      goals,
    },
  },
});

const draft: ProjectionResponse = {
  id: 'd1',
  kind: 'draft',
  name: 'Beer League',
  season: '20262027',
  autoNamed: true,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  data: {
    settings: {
      scoringType: 'category',
      statWeights: { goals: 5 },
      activeScoringColumns: ['goals'],
      activeUtilityColumns: ['gp'],
      scaleSettings: {},
      decimalSettings: { goals: 0 },
      useDefaultDecimals: false,
      leagueSize: 12,
      rosterSlots: { c: 1, lw: 1, rw: 1, d: 1, util: 1, bn: 1, g: 1 },
      minGoalieGames: 25,
    },
    players: [skater(1, 60), skater(2, 20)],
    draft: {
      teams: [
        { id: 'team-me', name: 'My Team', mine: true },
        { id: 'team-1', name: 'Team 1', mine: false },
      ],
      order: ['team-me', 'team-1'],
      picks: [
        { playerId: 1, teamId: 'team-me' },
        { playerId: 2, teamId: 'team-1' },
      ],
      finishedAt: '2026-07-15T10:00:00.000Z',
    },
  },
};

describe('DraftSummaryPageComponent', () => {
  const navigate = vi.fn(() => Promise.resolve(true));
  const notifyError = vi.fn();
  const loadProjection = vi.fn<(id: string) => Observable<ProjectionResponse>>(() => of(draft));
  let idParam: string | null = 'd1';

  const render = async () => {
    const fixture = MockRender(DraftSummaryPageComponent);
    await fixture.whenStable();
    return fixture.point.componentInstance;
  };

  beforeEach(() => {
    navigate.mockClear();
    notifyError.mockClear();
    loadProjection.mockReset();
    loadProjection.mockReturnValue(of(draft));
    idParam = 'd1';
    return MockBuilder(DraftSummaryPageComponent)
      .keep(ProjectionRankingService)
      .keep(ProjectionCalculationService)
      .keep(ProjectionSerializerService)
      .keep(DraftPlayerLookupService)
      .mock(PlayerService, { getPlayers: () => of(players) })
      .mock(ProjectionStorageService, { loadProjection })
      .mock(NotificationService, { error: notifyError })
      .provide({ provide: Router, useValue: { navigate } })
      .provide({
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (key: string) => (key === 'id' ? idParam : null) } },
        },
      });
  });

  /**
   * The page loads the draft itself rather than being handed one by the board, which is the whole
   * point of it having an address: a link to it, or a reload of it, shows the same summary.
   */
  it('loads the draft it is pointed at and ranks the teams by projected total', async () => {
    const component = await render();

    expect(loadProjection).toHaveBeenCalledWith('d1');
    expect(component.draftName()).toEqual('Beer League');
    expect(component.finished()).toBe(true);
    expect(component.scoringType()).toEqual('category');
    expect(component.scoreHeading()).toEqual('Z-Score');

    const projection = component.leagueProjection();
    expect(projection.teams.map((team) => team.teamId)).toEqual(['team-me', 'team-1']);
    expect(projection.teams[0].total).toBeGreaterThan(projection.teams[1].total);
    // Category cells hold the z-score contribution (not the raw stat): McDavid's 60 goals is +1σ
    // over the two-skater pool, and a team's category cells sum to its total.
    expect(projection.teams[0].values['goals']).toBeCloseTo(1, 5);
    expect(projection.teams[0].total).toBeCloseTo(projection.teams[0].values['goals'], 5);
    expect(projection.categoryColumns.map((column) => column.key)).toEqual(['goals']);
  });

  it('shows the picks as rounds and as teams', async () => {
    const component = await render();

    expect(component.resultRounds().map((round) => round.round)).toEqual([1]);
    expect(component.resultRounds()[0].picks.map((pick) => pick.playerId)).toEqual([1, 2]);
    expect(component.resultTeams().map((entry) => entry.team.id)).toEqual(['team-me', 'team-1']);
  });

  it('goes back to the board to edit the draft', async () => {
    const component = await render();

    component.editDraft();

    expect(navigate).toHaveBeenCalledWith(['/drafts', 'd1']);
  });

  // A board has no picks to total, and its own address is the editor's.
  it('sends a board that is not a draft to its editor', async () => {
    loadProjection.mockReturnValue(of({ ...draft, kind: 'projection' } as ProjectionResponse));

    const component = await render();

    expect(navigate).toHaveBeenCalledWith(['/projections', 'd1'], { replaceUrl: true });
    expect(component.loaded()).toBe(false);
  });

  it('says so and goes back to the drafts when the draft cannot be loaded', async () => {
    loadProjection.mockReturnValue(throwError(() => new Error('offline')));

    await render();

    expect(notifyError).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/draft']);
  });

  it('goes to the drafts when there is no draft in the address', async () => {
    idParam = null;

    await render();

    expect(loadProjection).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/draft']);
  });
});
