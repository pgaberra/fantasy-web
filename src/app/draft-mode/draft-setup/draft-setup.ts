import { Component, computed, input, OnInit, output, signal } from '@angular/core';
import { DraftState } from '../../api/models/draft-state';
import { DraftTeam } from '../../api/models/draft-team';
import { DEFAULT_LEAGUE_SIZE } from '../../draft-projection/projection-defaults';
import { onClock } from '../draft-snake';

interface SetupRow {
  id: string;
  name: string;
  mine: boolean;
}

const MIN_TEAMS = 2;
const MAX_TEAMS = 32;
const MINE_ID = 'team-me';

@Component({
  selector: 'app-draft-setup',
  templateUrl: './draft-setup.html',
  styleUrl: './draft-setup.css',
})
export class DraftSetupComponent implements OnInit {
  readonly initial = input<DraftState | null>(null);
  readonly seedName = input<string>('My Team');

  readonly confirmed = output<DraftState>();
  readonly cancelled = output<void>();

  readonly rows = signal<SetupRow[]>([]);

  readonly numTeams = computed(() => this.rows().length);
  readonly canAdd = computed(() => this.rows().length < MAX_TEAMS);
  readonly canRemove = computed(() => this.rows().length > MIN_TEAMS);
  readonly canCancel = computed(() => this.initial() !== null);

  private readonly mineId = computed(() => this.rows().find((row) => row.mine)?.id ?? MINE_ID);

  readonly myPickNumbers = computed(() => {
    const order = this.rows().map((row) => row.id);
    const mine = this.mineId();
    const numbers: number[] = [];
    for (let pick = 1; pick <= order.length * 3; pick++) {
      const slot = onClock(pick, order);
      if (slot && slot.teamId === mine) {
        numbers.push(pick);
      }
    }
    return numbers;
  });

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

  moveRow(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.rows().length) {
      return;
    }
    this.rows.update((rows) => {
      const next = [...rows];
      [next[index], next[target]] = [next[target], next[index]];
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
    this.confirmed.emit({ teams, order, picks: this.initial()?.picks ?? [] });
  }
}
