import {
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  linkedSignal,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ProjectionStorageService } from '../services/projection-storage.service';
import { NotificationService } from '../services/notification.service';
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
import { ProjectionSerializerService } from '../services/projection-serializer.service';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
} from '../draft-projection/projection-defaults';
import { LoadingIndicatorComponent } from '../shared/loading-indicator/loading-indicator';
import { DraftRosterService } from './draft-roster.service';
import { DraftSnakeService } from './draft-snake.service';
import { DraftSetupComponent, DraftSetupResult } from './draft-setup/draft-setup';
import { YahooSyncResult } from '../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { DraftPlayerLookupService } from './draft-player-lookup.service';
import { DraftRosterPanelComponent } from './draft-roster-panel/draft-roster-panel';
import { DraftAvailablePanelComponent } from './draft-available-panel/draft-available-panel';
import { DraftPicksPanelComponent } from './draft-picks-panel/draft-picks-panel';
import { DraftSummaryComponent } from './draft-summary/draft-summary';

const DEFAULT_PAGE_SIZE = 100;

@Component({
  selector: 'app-draft-mode',
  imports: [
    RouterLink,
    LoadingIndicatorComponent,
    DraftSetupComponent,
    DraftRosterPanelComponent,
    DraftAvailablePanelComponent,
    DraftPicksPanelComponent,
    DraftSummaryComponent,
  ],
  providers: [DraftPlayerLookupService],
  templateUrl: './draft-mode.html',
  styleUrl: './draft-mode.css',
})
export class DraftModeComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly projectionStorage = inject(ProjectionStorageService);
  private readonly notification = inject(NotificationService);
  private readonly playerService = inject(PlayerService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly positionFilterService = inject(PositionFilterService);
  private readonly serializer = inject(ProjectionSerializerService);
  private readonly snake = inject(DraftSnakeService);
  private readonly rosterService = inject(DraftRosterService);
  readonly lookup = inject(DraftPlayerLookupService);

  readonly projectionId = signal<string | null>(null);
  readonly projectionName = signal<string>('');
  readonly loaded = signal<boolean>(false);
  readonly saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  readonly searchTerm = signal<string>('');
  readonly positionFilter = signal<PositionFilter>('ALL');
  readonly pageSize = signal<number>(DEFAULT_PAGE_SIZE);
  readonly showStats = signal<boolean>(false);
  readonly pageSizeOptions: { label: string; value: number }[] = [
    { label: '100', value: 100 },
    { label: '200', value: 200 },
    { label: '300', value: 300 },
    { label: 'All', value: Infinity },
  ];
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
  readonly pendingRemoval = signal<number | null>(null);
  readonly viewedTeamId = signal<string | null>(null);
  readonly showSummary = signal<boolean>(false);
  readonly confirmingFinish = signal<boolean>(false);

  private readonly data = signal<ProjectionData | null>(null);
  private readonly allPlayers = signal<Player[]>([]);

  readonly playerMap = computed(
    () => new Map(this.allPlayers().map((player) => [player.id, player])),
  );

  private readonly projections = computed<Projection[]>(() => {
    const data = this.data();
    return data ? this.serializer.fromProjectionData(data).playerProjections : [];
  });

  readonly scoringType = computed(() => this.data()?.settings.scoringType ?? 'points');
  readonly statColumns = computed<ScoringStatKey[]>(
    () => (this.data()?.settings.activeScoringColumns ?? []) as ScoringStatKey[],
  );
  readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Total Points' : 'Z-Score',
  );
  readonly rosterSlots = computed(() => this.data()?.settings.rosterSlots ?? DEFAULT_ROSTER_SLOTS);
  readonly leagueSize = computed(() => this.data()?.settings.leagueSize ?? DEFAULT_LEAGUE_SIZE);
  readonly yahooSync = computed(() => this.data()?.settings.yahooSync ?? null);

  readonly teams = computed(() => this.draft()?.teams ?? []);
  readonly order = computed(() => this.draft()?.order ?? []);
  readonly picks = computed(() => this.draft()?.picks ?? []);

  readonly phase = computed<'setup' | 'draft'>(() =>
    !this.snake.isValidDraft(this.draft()) || this.setupOpen() ? 'setup' : 'draft',
  );

  private readonly teamById = computed(() => new Map(this.teams().map((team) => [team.id, team])));
  private readonly myTeamId = computed(() => this.teams().find((team) => team.mine)?.id ?? null);

  private readonly draftedIds = computed(() => new Set(this.picks().map((pick) => pick.playerId)));
  readonly effectiveTeamId = computed(() => {
    const selected = this.viewedTeamId();
    if (selected !== null && this.teams().some((team) => team.id === selected)) {
      return selected;
    }
    return this.myTeamId();
  });
  private readonly viewedPicks = computed(() => {
    const teamId = this.effectiveTeamId();
    return teamId === null ? [] : this.snake.picksForTeam(this.picks(), teamId);
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

  readonly visibleCount = linkedSignal({
    source: () => ({
      term: this.searchTerm(),
      position: this.positionFilter(),
      pageSize: this.pageSize(),
    }),
    computation: () => this.pageSize(),
  });
  readonly visibleAvailable = computed(() => this.available().slice(0, this.visibleCount()));
  readonly hasMoreAvailable = computed(() => this.visibleCount() < this.available().length);

  private readonly scoreByPlayerId = computed(() => {
    const isPoints = this.scoringType() === 'points';
    return new Map(
      this.ranked().map((scoredProjection) => [
        scoredProjection.projection.playerId,
        isPoints ? scoredProjection.score.fantasyPoints : scoredProjection.score.zScore,
      ]),
    );
  });

  readonly standings = computed(() => {
    const scores = this.scoreByPlayerId();
    return this.teams()
      .map((team) => {
        const players = this.picks()
          .filter((pick) => pick.teamId === team.id)
          .map((pick) => ({ playerId: pick.playerId, score: scores.get(pick.playerId) ?? 0 }))
          .sort((a, b) => b.score - a.score);
        const total = players.reduce((sum, player) => sum + player.score, 0);
        return { team, players, total };
      })
      .sort((a, b) => b.total - a.total);
  });

  readonly roster = computed(() =>
    this.rosterService.deriveRoster(this.viewedPicks(), this.playerMap(), this.rosterSlots()),
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
  readonly currentSlot = computed(() =>
    this.isComplete() ? null : this.snake.slotForPick(this.pickNumber(), this.order()),
  );
  readonly upNextTeam = computed(() => {
    const slot = this.currentSlot();
    return slot ? (this.teamById().get(slot.teamId) ?? null) : null;
  });
  readonly isMyPick = computed(() => !!this.upNextTeam()?.mine);
  readonly canUndo = computed(() => this.picks().length > 0);

  readonly draftLabel = computed(() => {
    if (this.isMyPick() || this.isComplete()) {
      return 'Draft';
    }
    const team = this.upNextTeam()?.name;
    return team ? `Draft for ${team}` : 'Draft';
  });

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

  readonly resultRounds = computed(() => {
    const teams = this.teamById();
    const teamCount = this.teams().length;
    if (teamCount === 0) {
      return [];
    }
    const rounds: {
      round: number;
      picks: { pickInRound: number; playerId: number; teamName: string; mine: boolean }[];
    }[] = [];
    this.picks().forEach((pick, index) => {
      const overall = index + 1;
      const round = Math.ceil(overall / teamCount);
      const pickInRound = overall - (round - 1) * teamCount;
      const team = teams.get(pick.teamId);
      const entry = {
        pickInRound,
        playerId: pick.playerId,
        teamName: team?.name ?? '',
        mine: team?.mine ?? false,
      };
      const current = rounds[rounds.length - 1];
      if (current && current.round === round) {
        current.picks.push(entry);
      } else {
        rounds.push({ round, picks: [entry] });
      }
    });
    return rounds;
  });

  readonly resultTeams = computed(() => {
    const picksByTeam = new Map<string, { overall: number; playerId: number }[]>();
    this.picks().forEach((pick, index) => {
      const list = picksByTeam.get(pick.teamId) ?? [];
      list.push({ overall: index + 1, playerId: pick.playerId });
      picksByTeam.set(pick.teamId, list);
    });
    const teams = this.teamById();
    return this.order()
      .map((teamId) => teams.get(teamId))
      .filter((team) => team !== undefined)
      .map((team) => ({ team, picks: picksByTeam.get(team.id) ?? [] }));
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

  readonly removalPreview = computed(() => {
    const overall = this.pendingRemoval();
    if (overall === null) {
      return null;
    }
    const picks = this.picks();
    const target = picks[overall - 1];
    if (!target) {
      return null;
    }
    const order = this.order();
    const teams = this.teamById();
    const targetTeam = teams.get(target.teamId);
    const positions = Array.from(
      { length: picks.length - overall },
      (_, index) => overall + 1 + index,
    );
    const changes = positions.map((position) => {
      const oldSlot = this.snake.slotForPick(position, order);
      const newSlot = this.snake.slotForPick(position - 1, order);
      const oldTeam = oldSlot ? teams.get(oldSlot.teamId) : undefined;
      const newTeam = newSlot ? teams.get(newSlot.teamId) : undefined;
      return {
        playerId: picks[position - 1].playerId,
        oldOverall: position,
        newOverall: position - 1,
        oldTeamName: oldTeam?.name ?? '',
        newTeamName: newTeam?.name ?? '',
        teamChanged: oldSlot?.teamId !== newSlot?.teamId,
        affectsMine: !!oldTeam?.mine || !!newTeam?.mine,
      };
    });
    return {
      overall,
      playerId: target.playerId,
      teamName: targetTeam?.name ?? '',
      mine: targetTeam?.mine ?? false,
      changes,
    };
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
          this.lookup.setPlayers(players);
          this.draft.set(this.serializer.fromProjectionData(projection.data).draft);
          this.loaded.set(true);
        },
        error: () => {
          this.notification.error("Couldn't load the draft. Please try again.");
          void this.router.navigate(['/projections']);
        },
      });
  }

  draftCurrent(playerId: number): void {
    const slot = this.currentSlot();
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
          const slot = this.snake.slotForPick(index + 1, draft.order);
          return { playerId: pick.playerId, teamId: slot ? slot.teamId : pick.teamId };
        }),
      };
    });
  }

  requestRemovePick(overall: number): void {
    if (overall >= this.picks().length) {
      this.removePick(overall);
    } else {
      this.editingPick.set(null);
      this.pendingRemoval.set(overall);
    }
  }

  confirmRemovePick(): void {
    const overall = this.pendingRemoval();
    if (overall !== null) {
      this.removePick(overall);
    }
    this.pendingRemoval.set(null);
  }

  cancelRemovePick(): void {
    this.pendingRemoval.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirmingFinish()) {
      this.cancelFinish();
    } else if (this.pendingRemoval() !== null) {
      this.cancelRemovePick();
    } else if (this.editingPick() !== null) {
      this.cancelEditPick();
    }
  }

  onSetupConfirmed(result: DraftSetupResult): void {
    this.data.update((data) =>
      data ? { ...data, settings: { ...data.settings, rosterSlots: result.rosterSlots } } : data,
    );
    this.applySetup(result.draft);
  }

  applyYahooSync(result: YahooSyncResult): void {
    const mapped = result.settings;
    this.data.update((data) => {
      if (!data) {
        return data;
      }
      return {
        ...data,
        settings: {
          ...data.settings,
          scoringType: mapped.scoringType,
          activeScoringColumns: [...mapped.activeScoringColumns],
          activeUtilityColumns: [...mapped.activeUtilityColumns],
          rosterSlots: mapped.rosterSlots,
          ...(mapped.leagueSize != null ? { leagueSize: mapped.leagueSize } : {}),
          ...(mapped.statWeights ? { statWeights: mapped.statWeights } : {}),
          yahooSync: {
            leagueName: result.leagueName,
            leagueKey: result.leagueKey,
            syncedAt: new Date().toISOString(),
          },
        },
      };
    });
    this.save();
  }

  applySetup(next: DraftState): void {
    this.draft.set(next);
    this.setupOpen.set(false);
    this.editingPick.set(null);
    this.viewedTeamId.set(null);
    this.showSummary.set(false);
    this.save();
  }

  cancelSetup(): void {
    if (this.snake.isValidDraft(this.draft())) {
      this.setupOpen.set(false);
    }
  }

  editTeams(): void {
    this.editingPick.set(null);
    this.setupOpen.set(true);
  }

  requestFinishDraft(): void {
    this.confirmingFinish.set(true);
  }

  cancelFinish(): void {
    this.confirmingFinish.set(false);
  }

  finishDraft(): void {
    this.confirmingFinish.set(false);
    this.showSummary.set(true);
  }

  backToDraft(): void {
    this.showSummary.set(false);
  }

  setPositionFilter(filter: PositionFilter): void {
    this.positionFilter.set(filter);
  }

  showMore(): void {
    this.visibleCount.update((count) => count + this.pageSize());
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
        error: () => this.saveStatus.set('error'),
      });
  }
}
