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
import { EspnSync } from '../../api/models/espn-sync';
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

interface SetupRow {
  id: string;
  name: string;
  mine: boolean;
}

/** What both league services answer: the teams, and the user's seat when the provider named one. */
interface LeagueTeams {
  teams: LeagueTeam[];
  draftPosition?: number | null;
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
  imports: [RosterSlotsEditorComponent, LeagueSyncComponent, LoadingIndicatorComponent],
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
  /** Opens the import on Yahoo, for a setup reached back from Yahoo's own consent screen. */
  readonly openOnYahoo = input<boolean>(false);
  readonly lastEspnSync = input<EspnSync | null>(null);

  readonly confirmed = output<DraftSetupResult>();
  readonly cancelled = output<void>();
  readonly yahooSynced = output<YahooSyncResult>();
  readonly espnSynced = output<EspnSyncResult>();

  readonly rows = signal<SetupRow[]>([]);
  readonly loadingTeams = signal(false);
  // Whether the seat below was actually named — by the league, or by the user picking one. A league
  // that names none leaves this false, because where a team sits in a league's team list is not
  // where it drafts, and a draft built on the wrong seat is wrong all the way down.
  readonly draftPositionKnown = signal(false);
  // Tracks the roster-slots input so a Yahoo sync (which updates it upstream) flows in,
  // while still letting the user edit the slots locally before starting the draft.
  readonly editableRosterSlots = linkedSignal<RosterSlots>(() => this.rosterSlots());

  readonly numTeams = computed(() => this.rows().length);
  readonly canAdd = computed(() => this.rows().length < MAX_TEAMS);
  readonly canRemove = computed(() => this.rows().length > MIN_TEAMS);
  readonly canCancel = computed(() => this.initial() !== null);
  /** The user's own seat in the draft order, from 1. The other teams fill the seats around it. */
  readonly myPosition = computed(() => this.rows().findIndex((row) => row.mine) + 1);
  readonly positions = computed(() => Array.from({ length: this.numTeams() }, (_, i) => i + 1));
  readonly canStart = computed(() => this.draftPositionKnown());

  ngOnInit(): void {
    const existing = this.initial();
    if (existing && existing.teams.length >= MIN_TEAMS) {
      this.rows.set(
        existing.order.map((id) => {
          const team = existing.teams.find((candidate) => candidate.id === id) ?? existing.teams[0];
          return { id: team.id, name: team.name, mine: team.mine };
        }),
      );
      this.draftPositionKnown.set(true);
      return;
    }
    const teamCount = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, this.leagueSize()));
    const rows: SetupRow[] = [{ id: MINE_ID, name: this.seedName(), mine: true }];
    for (let index = 1; index < teamCount; index++) {
      rows.push({ id: crypto.randomUUID(), name: '', mine: false });
    }
    this.rows.set(rows);

    // A projection synced earlier (in the editor, or on the page the draft was started from)
    // carries its league; pull that league's teams into a fresh setup so the user needn't re-sync
    // just to load them.
    const yahooSync = this.lastSync();
    const espnSync = this.lastEspnSync();
    if (yahooSync) {
      this.loadTeams(this.yahoo.leagueTeams(yahooSync.leagueKey));
    } else if (espnSync) {
      this.loadTeams(this.espn.leagueTeams(espnSync.leagueId));
    }
  }

  onPositionChange(event: Event): void {
    const chosen = (event.target as HTMLSelectElement).value;
    if (!chosen) {
      return;
    }
    this.setMyPosition(Number(chosen));
  }

  /** Moves the user's own team to the given seat; the other teams keep their order around it. */
  setMyPosition(position: number): void {
    this.draftPositionKnown.set(true);
    this.rows.update((rows) => {
      const mine = rows.find((row) => row.mine);
      if (!mine) {
        return rows;
      }
      const others = rows.filter((row) => !row.mine);
      const seat = Math.max(1, Math.min(position, rows.length));
      return [...others.slice(0, seat - 1), mine, ...others.slice(seat - 1)];
    });
  }

  addTeam(): void {
    if (!this.canAdd()) {
      return;
    }
    this.rows.update((rows) => [...rows, { id: crypto.randomUUID(), name: '', mine: false }]);
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

  onYahooSynced(result: YahooSyncResult): void {
    this.yahooSynced.emit(result);
    this.loadTeams(this.yahoo.leagueTeams(result.leagueKey));
  }

  onEspnSynced(result: EspnSyncResult): void {
    this.espnSynced.emit(result);
    this.loadTeams(this.espn.leagueTeams(result.leagueId));
  }

  private loadTeams(teams$: Observable<LeagueTeams>): void {
    this.loadingTeams.set(true);
    teams$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.applyTeams(response);
        this.loadingTeams.set(false);
      },
      // A synced projection already carries the scoring/roster; pre-filling team names is
      // best-effort, so a failure just falls back to the rows already in place.
      error: () => this.loadingTeams.set(false),
    });
  }

  /**
   * A league's size and the user's own seat, which is all a league can be relied on to tell before
   * its draft starts. The seat is taken only from `draftPosition`, which the league services leave
   * null unless the provider named it; a league that names none leaves the user to pick, since the
   * row a team occupies in a team list says nothing about when it drafts.
   * The other teams stay unnamed; following the league's draft brings in its real teams.
   */
  private applyTeams(response: LeagueTeams): void {
    const teams = response.teams;
    if (teams.length < MIN_TEAMS || (this.initial()?.picks ?? []).length > 0) {
      return;
    }
    const leagueTeams = teams.slice(0, MAX_TEAMS);
    const flagged = leagueTeams.findIndex((team) => team.mine);
    const seat = response.draftPosition ?? null;
    const known = seat !== null && seat >= 1 && seat <= leagueTeams.length;
    const mineIndex = known ? seat - 1 : Math.max(0, flagged);
    const mineName = flagged >= 0 ? leagueTeams[flagged].name : this.seedName();
    const rows: SetupRow[] = leagueTeams.map((_, index) =>
      index === mineIndex
        ? { id: MINE_ID, name: mineName, mine: true }
        : { id: crypto.randomUUID(), name: '', mine: false },
    );
    this.rows.set(rows);
    this.draftPositionKnown.set(known);
  }

  submit(): void {
    if (!this.canStart()) {
      return;
    }
    const rows = this.rows();
    let unnamed = 0;
    const teams: DraftTeam[] = rows.map((row) => ({
      id: row.id,
      name: row.name.trim() || (row.mine ? 'My Team' : `Team ${++unnamed}`),
      mine: row.mine,
    }));
    const order = rows.map((row) => row.id);
    this.confirmed.emit({
      draft: { teams, order, picks: this.initial()?.picks ?? [] },
      rosterSlots: this.editableRosterSlots(),
    });
  }
}
