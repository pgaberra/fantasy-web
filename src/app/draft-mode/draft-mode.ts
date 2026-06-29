import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { PlayerService } from '../services/player.service';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { PositionFilterService } from '../services/position-filter.service';
import { Player } from '../models/player.model';
import {
  PositionFilter,
  Projection,
  ScoredProjection,
  StatWeights,
} from '../models/projection.model';
import { ScoringStatKey } from '../models/stat-key.model';
import { DraftState } from '../api/models/draft-state';
import { ProjectionData } from '../api/models/projection-data';
import { fromProjectionData } from '../services/projection-serializer';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
} from '../draft-projection/projection-defaults';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { deriveRoster } from './draft-roster';
import { isValidDraft, onClock, picksForTeam } from './draft-snake';
import { DraftSetupComponent } from './draft-setup/draft-setup';

@Component({
  selector: 'app-draft-mode',
  imports: [RouterLink, LoadingIndicatorComponent, DraftSetupComponent],
  templateUrl: './draft-mode.html',
  styleUrl: './draft-mode.css',
})
export class DraftModeComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly playerService = inject(PlayerService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly positionFilterService = inject(PositionFilterService);

  readonly projectionId = signal<string | null>(null);
  readonly projectionName = signal<string>('');
  readonly loaded = signal<boolean>(false);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  readonly searchTerm = signal<string>('');
  readonly positionFilter = signal<PositionFilter>('ALL');
  readonly positionFilters: { value: PositionFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'C', label: 'C' },
    { value: 'LW', label: 'LW' },
    { value: 'RW', label: 'RW' },
    { value: 'D', label: 'D' },
    { value: 'G', label: 'G' },
  ];

  readonly draft = signal<DraftState | null>(null);
  readonly setupOpen = signal<boolean>(false);
  readonly editingPick = signal<number | null>(null);

  private readonly data = signal<ProjectionData | null>(null);
  private readonly allPlayers = signal<Player[]>([]);

  readonly playerMap = computed(
    () => new Map(this.allPlayers().map((player) => [player.id, player])),
  );

  private readonly projections = computed<Projection[]>(() => {
    const data = this.data();
    return data ? fromProjectionData(data).playerProjections : [];
  });

  private readonly scoringType = computed(() => this.data()?.settings.scoringType ?? 'points');
  private readonly rosterSlots = computed(
    () => this.data()?.settings.rosterSlots ?? DEFAULT_ROSTER_SLOTS,
  );

  readonly teams = computed(() => this.draft()?.teams ?? []);
  readonly order = computed(() => this.draft()?.order ?? []);
  readonly picks = computed(() => this.draft()?.picks ?? []);

  readonly phase = computed<'setup' | 'draft'>(() =>
    !isValidDraft(this.draft()) || this.setupOpen() ? 'setup' : 'draft',
  );

  private readonly teamById = computed(() => new Map(this.teams().map((team) => [team.id, team])));
  private readonly myTeamId = computed(() => this.teams().find((team) => team.mine)?.id ?? null);

  private readonly draftedIds = computed(() => new Set(this.picks().map((pick) => pick.playerId)));
  private readonly minePicks = computed(() => {
    const mine = this.myTeamId();
    return mine === null ? [] : picksForTeam(this.picks(), mine);
  });

  private readonly ranked = computed<ScoredProjection[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const settings = data.settings;
    return this.ranking.rankOverall({
      projections: this.projections(),
      scoringType: settings.scoringType,
      statWeights: settings.statWeights as StatWeights,
      activeScoringColumns: new Set(settings.activeScoringColumns as ScoringStatKey[]),
      leagueSize: settings.leagueSize ?? DEFAULT_LEAGUE_SIZE,
      rosterSlots: settings.rosterSlots ?? DEFAULT_ROSTER_SLOTS,
      minGoalieGames: settings.minGoalieGames ?? DEFAULT_MIN_GOALIE_GAMES,
      decimalSettings: settings.decimalSettings,
    });
  });

  readonly available = computed<ScoredProjection[]>(() => {
    const drafted = this.draftedIds();
    const term = this.searchTerm().trim().toLowerCase();
    const filter = this.positionFilter();
    const players = this.playerMap();
    return this.ranked().filter((scoredProjection) => {
      if (drafted.has(scoredProjection.projection.playerId)) {
        return false;
      }
      if (!this.positionFilterService.matches(scoredProjection.projection, players, filter)) {
        return false;
      }
      if (!term) {
        return true;
      }
      return players.get(scoredProjection.projection.playerId)?.name.toLowerCase().includes(term);
    });
  });

  readonly roster = computed(() =>
    deriveRoster(this.minePicks(), this.playerMap(), this.rosterSlots()),
  );
  readonly filledCount = computed(
    () => this.roster().slots.filter((slot) => slot.playerId !== null).length,
  );
  readonly totalSlots = computed(() => this.roster().slots.length);

  readonly pickNumber = computed(() => this.picks().length + 1);
  readonly totalPicks = computed(() => this.teams().length * this.totalSlots());
  readonly isComplete = computed(
    () => this.totalPicks() > 0 && this.picks().length >= this.totalPicks(),
  );
  readonly clock = computed(() =>
    this.isComplete() ? null : onClock(this.pickNumber(), this.order()),
  );
  readonly onClockTeam = computed(() => {
    const slot = this.clock();
    return slot ? (this.teamById().get(slot.teamId) ?? null) : null;
  });
  readonly isMyPick = computed(() => !!this.onClockTeam()?.mine);
  readonly canUndo = computed(() => this.picks().length > 0);

  readonly pickRounds = computed(() => {
    const teams = this.teamById();
    const teamCount = this.teams().length;
    if (teamCount === 0) {
      return [];
    }
    const rounds: {
      round: number;
      picks: { overall: number; teamName: string; mine: boolean; playerId: number }[];
    }[] = [];
    this.picks().forEach((pick, index) => {
      const overall = index + 1;
      const round = Math.ceil(overall / teamCount);
      const team = teams.get(pick.teamId);
      const entry = {
        overall,
        teamName: team?.name ?? '',
        mine: team?.mine ?? false,
        playerId: pick.playerId,
      };
      const current = rounds[rounds.length - 1];
      if (current && current.round === round) {
        current.picks.push(entry);
      } else {
        rounds.push({ round, picks: [entry] });
      }
    });
    rounds.reverse();
    rounds.forEach((group) => {
      group.picks.reverse();
    });
    return rounds;
  });

  readonly editingInfo = computed(() => {
    const overall = this.editingPick();
    if (overall === null) {
      return null;
    }
    const pick = this.picks()[overall - 1];
    if (!pick) {
      return null;
    }
    const team = this.teamById().get(pick.teamId);
    return { overall, teamName: team?.name ?? '', mine: team?.mine ?? false };
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/projections']);
      return;
    }
    forkJoin({
      projection: this.projectionStorage.loadProjection(id),
      players: this.playerService.getPlayers(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ projection, players }) => {
          this.projectionId.set(projection.id);
          this.projectionName.set(projection.name);
          this.data.set(projection.data);
          this.allPlayers.set(players);
          this.draft.set(fromProjectionData(projection.data).draft);
          this.loaded.set(true);
        },
        error: () => void this.router.navigate(['/projections']),
      });
  }

  draftCurrent(playerId: number): void {
    const slot = this.clock();
    if (!slot || this.draftedIds().has(playerId)) {
      return;
    }
    this.mutate((draft) => ({
      ...draft,
      picks: [...draft.picks, { playerId, teamId: slot.teamId }],
    }));
  }

  undoLast(): void {
    if (!this.picks().length) {
      return;
    }
    this.mutate((draft) => ({ ...draft, picks: draft.picks.slice(0, -1) }));
  }

  startEditPick(overall: number): void {
    this.editingPick.set(overall);
  }

  cancelEditPick(): void {
    this.editingPick.set(null);
  }

  replacePick(playerId: number): void {
    const overall = this.editingPick();
    if (overall === null || this.draftedIds().has(playerId)) {
      return;
    }
    this.mutate((draft) => ({
      ...draft,
      picks: draft.picks.map((pick, index) =>
        index + 1 === overall ? { ...pick, playerId } : pick,
      ),
    }));
    this.editingPick.set(null);
  }

  removePick(overall: number): void {
    if (overall < 1 || overall > this.picks().length) {
      return;
    }
    this.editingPick.set(null);
    this.mutate((draft) => {
      const remaining = draft.picks.filter((_, index) => index + 1 !== overall);
      return {
        ...draft,
        picks: remaining.map((pick, index) => {
          const slot = onClock(index + 1, draft.order);
          return { playerId: pick.playerId, teamId: slot ? slot.teamId : pick.teamId };
        }),
      };
    });
  }

  applySetup(next: DraftState): void {
    this.draft.set(next);
    this.setupOpen.set(false);
    this.editingPick.set(null);
    this.save();
  }

  cancelSetup(): void {
    if (isValidDraft(this.draft())) {
      this.setupOpen.set(false);
    }
  }

  editTeams(): void {
    this.editingPick.set(null);
    this.setupOpen.set(true);
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  setPositionFilter(filter: PositionFilter): void {
    this.positionFilter.set(filter);
  }

  playerName(playerId: number): string {
    return this.playerMap().get(playerId)?.name ?? '';
  }

  playerTeam(playerId: number): string {
    return this.playerMap().get(playerId)?.teamAbbrev ?? '';
  }

  playerPositions(playerId: number): string {
    const player = this.playerMap().get(playerId);
    if (!player) {
      return '';
    }
    return player.type === 'goalie' ? 'G' : [...player.positions].join('/');
  }

  playerHeadshot(playerId: number): string | undefined {
    return this.playerMap().get(playerId)?.headshot;
  }

  playerInitials(playerId: number): string {
    const name = this.playerMap().get(playerId)?.name ?? '';
    return name
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  primaryPosition(playerId: number): string {
    const player = this.playerMap().get(playerId);
    if (!player) {
      return '';
    }
    if (player.type === 'goalie') {
      return 'g';
    }
    if (player.positions.has('C')) {
      return 'c';
    }
    if (player.positions.has('LW')) {
      return 'lw';
    }
    if (player.positions.has('RW')) {
      return 'rw';
    }
    if (player.positions.has('D')) {
      return 'd';
    }
    return 'util';
  }

  scoreLabel(scoredProjection: ScoredProjection): string {
    return this.scoringType() === 'points'
      ? scoredProjection.score.fantasyPoints.toFixed(1)
      : scoredProjection.score.zScore.toFixed(2);
  }

  private mutate(fn: (draft: DraftState) => DraftState): void {
    this.draft.update((draft) => (draft ? fn(draft) : draft));
    this.save();
  }

  private save(): void {
    const id = this.projectionId();
    const data = this.data();
    if (!id || !data) {
      return;
    }
    const draft = this.draft();
    const updated: ProjectionData = { ...data, draft: draft ?? undefined };
    this.saveStatus.set('saving');
    this.projectionStorage
      .updateProjection(id, { name: this.projectionName(), data: updated })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.saveStatus.set('saved'),
        error: () => this.saveStatus.set('idle'),
      });
  }
}
