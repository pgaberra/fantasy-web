import { Component, computed, input, linkedSignal, OnInit, output, signal } from '@angular/core';
import { DraftState } from '../../api/models/draft-state';
import { DraftTeam } from '../../api/models/draft-team';
import { RosterSlots } from '../../api/models/roster-slots';
import { YahooSync } from '../../api/models/yahoo-sync';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_ROSTER_SLOTS,
} from '../../draft-projection/projection-defaults';
import { RosterSlotsEditorComponent } from '../../shared/roster-slots-editor/roster-slots-editor';
import {
  YahooLeagueSyncComponent,
  YahooSyncResult,
} from '../../draft-projection/projection-settings-section/yahoo-league-sync/yahoo-league-sync';
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
    YahooLeagueSyncComponent,
  ],
  templateUrl: './draft-setup.html',
  styleUrl: './draft-setup.css',
})
export class DraftSetupComponent implements OnInit {
  readonly initial = input<DraftState | null>(null);
  readonly seedName = input<string>('My Team');
  readonly rosterSlots = input<RosterSlots>(DEFAULT_ROSTER_SLOTS);
  readonly lastSync = input<YahooSync | null>(null);

  readonly confirmed = output<DraftSetupResult>();
  readonly cancelled = output<void>();
  readonly yahooSynced = output<YahooSyncResult>();

  readonly rows = signal<SetupRow[]>([]);
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
    const rows: SetupRow[] = [{ id: MINE_ID, name: this.seedName(), mine: true }];
    for (let index = 1; index < DEFAULT_LEAGUE_SIZE; index++) {
      rows.push({ id: crypto.randomUUID(), name: `Team ${index}`, mine: false });
    }
    this.rows.set(rows);
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
