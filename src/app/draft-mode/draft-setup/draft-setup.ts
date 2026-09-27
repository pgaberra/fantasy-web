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
import { RosterSlots } from '../../api/models/roster-slots';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
} from '../../draft-projection/projection-defaults';
import { RosterSlotsEditorComponent } from '../../shared/roster-slots-editor/roster-slots-editor';
import { IconComponent } from '../../shared/icon/icon';

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

/**
 * The setup of a draft played by hand: the league size, the user's own seat and the roster slots.
 * A draft that follows its league's draft never comes here, because the league owns the teams and
 * the order while it is followed. This is where a draft with no league to follow starts, and where
 * a board goes when its teams are edited with sync off. It offers following the league instead
 * wherever the page can.
 */
@Component({
  selector: 'app-draft-setup',
  imports: [RosterSlotsEditorComponent, IconComponent],
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
  readonly rosterSlots = input<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly leagueSize = input<number>(DEFAULT_LEAGUE_SIZE);
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
  // Tracks the roster-slots input so a league import upstream flows in, while still letting the
  // user edit the slots locally before starting the draft.
  readonly editableRosterSlots = linkedSignal<RosterSlots>(() => this.rosterSlots());

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
    const teamCount = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, this.leagueSize()));
    const rows: SetupRow[] = [{ id: MINE_ID, name: this.seedName(), mine: true }];
    for (let index = 1; index < teamCount; index++) {
      rows.push({ id: crypto.randomUUID(), name: '', mine: false });
    }
    this.rows.set(rows);
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
      rosterSlots: this.editableRosterSlots(),
    });
  }
}
