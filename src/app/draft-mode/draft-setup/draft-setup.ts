import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { DraftState } from '../../api/models/draft-state';
import { DraftTeam } from '../../api/models/draft-team';
import { LeagueTeam } from '../../api/models/league-team';
import { RosterSlots } from '../../api/models/roster-slots';
import { YahooSync } from '../../api/models/yahoo-sync';
import { YahooService } from '../../services/yahoo.service';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
} from '../../draft-projection/projection-defaults';
import { RosterSlotsEditorComponent } from '../../shared/roster-slots-editor/roster-slots-editor';
import { LoadingIndicatorComponent } from '../../shared/loading-indicator/loading-indicator';
import { YahooSyncResult } from '../../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
import { EspnSyncResult } from '../../draft-projection/projection-settings-section/espn-league-sync/espn-league-sync';
import { LeagueSyncComponent } from '../../draft-projection/projection-settings-section/league-sync/league-sync';
import { EspnService } from '../../services/espn.service';
import { IconComponent } from '../../shared/icon/icon';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';

interface SetupRow {
  id: string;
  name: string;
  mine: boolean;
}

export interface DraftSetupResult {
  draft: DraftState;
  rosterSlots: RosterSlots;
}

const MIN_TEAMS = 2;
const MAX_TEAMS = 32;
const MINE_ID = 'team-me';

@Component({
  selector: 'app-draft-setup',
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    RosterSlotsEditorComponent,
    LeagueSyncComponent,
    LoadingIndicatorComponent,
    IconComponent,
  ],
  templateUrl: './draft-setup.html',
  styleUrl: './draft-setup.css',
})
export class DraftSetupComponent implements OnInit {
  private readonly yahoo = inject(YahooService);
  private readonly espn = inject(EspnService);
  private readonly destroyRef = inject(DestroyRef);

  readonly initial = input<DraftState | null>(null);
  readonly seedName = input<string>('My Team');
  readonly rosterSlots = input<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly leagueSize = input<number>(DEFAULT_LEAGUE_SIZE);
  readonly lastSync = input<YahooSync | null>(null);

  readonly confirmed = output<DraftSetupResult>();
  readonly cancelled = output<void>();
  readonly yahooSynced = output<YahooSyncResult>();
  readonly espnSynced = output<EspnSyncResult>();

  readonly rows = signal<SetupRow[]>([]);
  readonly loadingTeams = signal(false);
  // Tracks the roster-slots input so a Yahoo sync (which updates it upstream) flows in,
  // while still letting the user edit the slots locally before starting the draft.
  readonly editableRosterSlots = linkedSignal<RosterSlots>(() => this.rosterSlots());

  readonly numTeams = computed(() => this.rows().length);
  readonly canAdd = computed(() => this.rows().length < MAX_TEAMS);
  readonly canRemove = computed(() => this.rows().length > MIN_TEAMS);
  readonly canCancel = computed(() => this.initial() !== null);

  ngOnInit(): void {
    const existing = this.initial();
    if (existing && existing.teams.length >= MIN_TEAMS) {
      this.rows.set(
        existing.order.map((id) => {
          const team = existing.teams.find((candidate) => candidate.id === id) ?? existing.teams[0];
          return { id: team.id, name: team.name, mine: team.mine };
        }),
      );
      return;
    }
    const teamCount = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, this.leagueSize()));
    const rows: SetupRow[] = [{ id: MINE_ID, name: this.seedName(), mine: true }];
    for (let index = 1; index < teamCount; index++) {
      rows.push({ id: crypto.randomUUID(), name: `Team ${index}`, mine: false });
    }
    this.rows.set(rows);

    // A projection synced earlier (in the editor) carries its Yahoo league; pull that
    // league's teams into a fresh setup so the user needn't re-sync just to load them.
    const sync = this.lastSync();
    if (sync) {
      this.loadTeams(this.yahoo.leagueTeams(sync.leagueKey));
    }
  }

  updateName(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, name: value } : row)));
  }

  drop(event: CdkDragDrop<SetupRow[]>): void {
    this.reorder(event.previousIndex, event.currentIndex);
  }

  reorder(previousIndex: number, currentIndex: number): void {
    this.rows.update((rows) => {
      const next = [...rows];
      moveItemInArray(next, previousIndex, currentIndex);
      return next;
    });
  }

  addTeam(): void {
    if (!this.canAdd()) {
      return;
    }
    this.rows.update((rows) => [
      ...rows,
      { id: crypto.randomUUID(), name: `Team ${rows.length}`, mine: false },
    ]);
  }

  removeTeam(): void {
    if (!this.canRemove()) {
      return;
    }
    const picked = new Set((this.initial()?.picks ?? []).map((pick) => pick.teamId));
    const rows = this.rows();
    for (let index = rows.length - 1; index >= 0; index--) {
      if (!rows[index].mine && !picked.has(rows[index].id)) {
        this.rows.set(rows.filter((_, i) => i !== index));
        return;
      }
    }
  }

  teamHasPicks(id: string): boolean {
    return (this.initial()?.picks ?? []).some((pick) => pick.teamId === id);
  }

  onYahooSynced(result: YahooSyncResult): void {
    this.yahooSynced.emit(result);
    this.loadTeams(this.yahoo.leagueTeams(result.leagueKey));
  }

  onEspnSynced(result: EspnSyncResult): void {
    this.espnSynced.emit(result);
    this.loadTeams(this.espn.leagueTeams(result.leagueId));
  }

  private loadTeams(teams$: Observable<{ teams: LeagueTeam[] }>): void {
    this.loadingTeams.set(true);
    teams$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.applyTeams(response.teams);
        this.loadingTeams.set(false);
      },
      // A synced projection already carries the scoring/roster; pre-filling team names is
      // best-effort, so a failure just falls back to the rows already in place.
      error: () => this.loadingTeams.set(false),
    });
  }

  private applyTeams(teams: LeagueTeam[]): void {
    if (teams.length < MIN_TEAMS || (this.initial()?.picks ?? []).length > 0) {
      return;
    }
    let mineAssigned = false;
    const rows: SetupRow[] = teams.slice(0, MAX_TEAMS).map((team) => {
      const mine = team.mine && !mineAssigned;
      mineAssigned = mineAssigned || mine;
      return { id: mine ? MINE_ID : crypto.randomUUID(), name: team.name, mine };
    });
    if (!mineAssigned) {
      rows[0] = { ...rows[0], id: MINE_ID, mine: true };
    }
    this.rows.set(rows);
  }

  submit(): void {
    const rows = this.rows();
    const teams: DraftTeam[] = rows.map((row, index) => ({
      id: row.id,
      name: row.name.trim() || (row.mine ? 'My Team' : `Team ${index}`),
      mine: row.mine,
    }));
    const order = rows.map((row) => row.id);
    this.confirmed.emit({
      draft: { teams, order, picks: this.initial()?.picks ?? [] },
      rosterSlots: this.editableRosterSlots(),
    });
  }
}
