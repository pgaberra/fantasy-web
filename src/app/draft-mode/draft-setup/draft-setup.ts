import {
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DraftState } from '../../api/models/draft-state';
import { DraftTeam } from '../../api/models/draft-team';
import { DraftSettings } from '../../api/models/draft-settings';
import { RosterSlots } from '../../api/models/roster-slots';
import { ScoringStatKey } from '../../models/stat-key.model';
import { RosterSlotsEditorComponent } from '../../shared/roster-slots-editor/roster-slots-editor';
import { IconComponent } from '../../shared/icon/icon';
import {
  draftSettingsOf,
  LeagueSettings,
  leagueSettingsFromDraft,
} from '../../shared/league-settings/league-settings';
import { LeagueSettingsControlsComponent } from '../../shared/league-settings-controls/league-settings-controls';
import { StatWeightsEditorComponent } from '../../shared/stat-weights-editor/stat-weights-editor';

interface SetupRow {
  id: string;
  name: string;
  mine: boolean;
}

export interface DraftSetupResult {
  draft: DraftState;
  /** The league the draft is ranked by, its size the number of teams set up. */
  league: DraftSettings;
}

const MIN_TEAMS = 2;
const MAX_TEAMS = 32;
const MINE_ID = 'team-me';

/**
 * The setup of a draft played by hand: how the league scores, its size, the user's own seat and
 * the roster slots. A draft that follows its league's draft never comes here, because the league
 * owns the teams and the order while it is followed. This is where a draft with no league to
 * follow starts, and where a board goes when its settings are edited with sync off. It offers
 * following the league instead wherever the page can.
 *
 * <p>The league is set here rather than on the page that picks what to draft against: it belongs
 * to the draft, not to the board it is played against, and here it stays within reach for as long
 * as the draft runs. Nothing is kept until the setup is confirmed, so Cancel leaves the draft as
 * it was.
 */
@Component({
  selector: 'app-draft-setup',
  imports: [
    RosterSlotsEditorComponent,
    IconComponent,
    LeagueSettingsControlsComponent,
    StatWeightsEditorComponent,
  ],
  templateUrl: './draft-setup.html',
  styleUrl: './draft-setup.css',
})
export class DraftSetupComponent implements OnInit {
  readonly initial = input<DraftState | null>(null);
  /**
   * Whether the user's seat in `initial` is one somebody chose. False for a board whose order is
   * only the league's team list, taken before the league set its draft order: the seat is asked
   * for again, and there is no going back to a board that would be played on a guess.
   */
  readonly positionKnown = input<boolean>(true);
  readonly seedName = input<string>('My Team');
  /** The league the draft is ranked by as it stands: the draft's own, or what it starts from. */
  readonly league = input.required<DraftSettings>();
  /** The sync switch's name, where this draft can follow its league's draft instead. */
  readonly syncLabel = input<string | null>(null);
  /** Why following the league's draft did not work, where that is how the setup was reached. */
  readonly notice = input<string | null>(null);

  readonly confirmed = output<DraftSetupResult>();
  readonly cancelled = output<void>();
  readonly syncRequested = output<void>();

  readonly rows = signal<SetupRow[]>([]);
  // Whether the seat below was actually named: by the user picking one, or by a saved setup that
  // already carries one. A fresh setup starts without, since nothing has told this page the seat,
  // and a draft built on the wrong seat is wrong all the way down.
  readonly draftPositionKnown = signal(false);
  // Set when Start is pressed with no seat chosen: the button stays enabled so the user learns what
  // is missing from the field itself, instead of guessing at why a disabled button won't go.
  readonly startAttempted = signal(false);
  // The league as edited here, kept apart from the draft's until the setup is confirmed. Its size
  // is not edited as a number: it is the teams below, and is read off them on the way out.
  readonly editableLeague = linkedSignal<LeagueSettings>(() =>
    leagueSettingsFromDraft(this.league()),
  );
  readonly scoresByPoints = computed(() => this.editableLeague().scoringType === 'points');

  readonly numTeams = computed(() => this.rows().length);
  readonly canAdd = computed(() => this.rows().length < MAX_TEAMS);
  readonly canRemove = computed(() => this.rows().length > MIN_TEAMS);
  readonly canCancel = computed(() => this.initial() !== null && this.positionKnown());
  /** Whether this is a league's board whose draft order the league has not set yet. */
  readonly leagueOrderPending = computed(() => this.initial() !== null && !this.positionKnown());
  /** The user's own seat in the draft order, from 1. The other teams fill the seats around it. */
  readonly myPosition = computed(() => this.rows().findIndex((row) => row.mine) + 1);
  readonly positions = computed(() => Array.from({ length: this.numTeams() }, (_, i) => i + 1));
  readonly canStart = computed(() => this.draftPositionKnown());
  readonly positionMissing = computed(() => this.startAttempted() && !this.draftPositionKnown());

  private readonly positionSelect = viewChild<ElementRef<HTMLSelectElement>>('positionSelect');

  ngOnInit(): void {
    const existing = this.initial();
    if (existing && existing.teams.length >= MIN_TEAMS) {
      this.rows.set(
        existing.order.map((id) => {
          const team = existing.teams.find((candidate) => candidate.id === id) ?? existing.teams[0];
          return { id: team.id, name: team.name, mine: team.mine };
        }),
      );
      this.draftPositionKnown.set(this.positionKnown());
      return;
    }
    this.rows.set([{ id: MINE_ID, name: this.seedName(), mine: true }]);
    this.resizeTo(this.editableLeague().leagueSize);
  }

  /**
   * A change from the league controls. The only one that moves the size is an import, which says
   * how many teams the league has, so the teams follow it.
   */
  setLeague(next: LeagueSettings): void {
    const size = this.editableLeague().leagueSize;
    this.editableLeague.set(next);
    if (next.leagueSize !== size) {
      this.resizeTo(next.leagueSize);
    }
  }

  setStatWeights(statWeights: Record<ScoringStatKey, number>): void {
    this.editableLeague.update((league) => ({ ...league, statWeights }));
  }

  setRosterSlots(rosterSlots: RosterSlots): void {
    this.editableLeague.update((league) => ({ ...league, rosterSlots }));
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

  /** Drops the last team that is not the user's and has no picks; none such, and nothing goes. */
  removeTeam(): boolean {
    if (!this.canRemove()) {
      return false;
    }
    const picked = new Set((this.initial()?.picks ?? []).map((pick) => pick.teamId));
    const rows = this.rows();
    for (let index = rows.length - 1; index >= 0; index--) {
      if (!rows[index].mine && !picked.has(rows[index].id)) {
        this.rows.set(rows.filter((_, i) => i !== index));
        return true;
      }
    }
    return false;
  }

  /** Adds or drops teams toward `count`, as far as the bounds and the picks already made allow. */
  private resizeTo(count: number): void {
    const target = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, count));
    while (this.rows().length < target) {
      this.addTeam();
    }
    while (this.rows().length > target && this.removeTeam()) {
      // Each pass drops one team.
    }
  }

  submit(): void {
    if (!this.canStart()) {
      this.startAttempted.set(true);
      this.positionSelect()?.nativeElement.focus();
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
      league: draftSettingsOf({ ...this.editableLeague(), leagueSize: rows.length }),
    });
  }
}
