import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LandingPlayersService } from '../landing-players.service';
import { ProjectionRankingService } from '../../services/projection-ranking.service';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { ScoringType } from '../../models/projection.model';
import { ScoringStatKey } from '../../models/stat-key.model';
import { Player } from '../../models/player.model';
import { ErrorStateComponent } from '../../shared/error-state/error-state';
import { PositionChipsComponent } from '../../shared/position-chips/position-chips';
import { ownLine } from '../../shared/pool-line';
import { parseDecimalInput } from '../../shared/decimal-input';
import {
  DEFAULT_LEAGUE_SIZE,
  DEFAULT_MIN_GOALIE_GAMES,
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_STAT_WEIGHTS,
} from '../../draft-projection/projection-defaults';
import { DEFAULT_DECIMAL_SETTINGS } from '../../draft-projection/projection-settings-section/model';
import { changedSlots, fillLineup, LINEUP_SLOTS, LINEUP_WEIGHT_KEYS, LineupRow } from './lineup';

/** How long a slot whose player changed keeps its highlight: long enough to be noticed, not read. */
export const HIGHLIGHT_HOLD_MS = 1600;

/**
 * The lineup card in the landing page's first viewport: seven slots filled from the live player
 * pool by the visitor's own scoring, refilled the moment a weight or the league type changes.
 *
 * It is the page's proof rather than its editor: the full editor sits below it. The ranking is the
 * editor's own (`ProjectionRankingService`), over every player's real line, so a slot shows what the
 * editor's first rows would, and the eight weights are the ones the card draws, so nothing scores
 * that the visitor cannot see.
 */
@Component({
  selector: 'app-landing-lineup',
  imports: [ErrorStateComponent, PositionChipsComponent, StatLabelPipe],
  templateUrl: './landing-lineup.html',
  styleUrl: './landing-lineup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingLineupComponent {
  private readonly pool = inject(LandingPlayersService);
  private readonly ranking = inject(ProjectionRankingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly weightKeys = LINEUP_WEIGHT_KEYS;
  protected readonly scoringType = signal<ScoringType>('points');
  protected readonly weights = signal<Record<ScoringStatKey, number>>({ ...DEFAULT_STAT_WEIGHTS });

  protected readonly loading = computed(() => this.pool.players.isLoading());
  protected readonly error = computed(() => this.pool.players.error());
  // Read through hasValue(): a resource in its error state throws on value(), and the card still
  // has to draw its error state over empty slots.
  private readonly players = computed<readonly Player[]>(() =>
    this.pool.players.hasValue() ? this.pool.players.value() : [],
  );
  /** True until a pool has arrived: the rows then draw their waiting state, prerendered too. */
  protected readonly pending = computed(() => this.players().length === 0);

  private readonly playersById = computed(
    () => new Map<number, Player>(this.players().map((player) => [player.id, player])),
  );

  private readonly ranked = computed(() =>
    this.ranking.rankOverall({
      projections: this.players().map(ownLine),
      scoringType: this.scoringType(),
      statWeights: this.weights(),
      activeScoringColumns: new Set(LINEUP_WEIGHT_KEYS),
      leagueSize: DEFAULT_LEAGUE_SIZE,
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      minGoalieGames: DEFAULT_MIN_GOALIE_GAMES,
      decimalSettings: DEFAULT_DECIMAL_SETTINGS,
    }),
  );

  protected readonly lineup = computed<readonly LineupRow[]>(() =>
    fillLineup(this.ranked(), this.playersById(), this.scoringType()),
  );

  /** The slots whose player just changed, held for a moment so the eye can catch the move. */
  protected readonly changed = signal<ReadonlySet<number>>(new Set());
  private previous: readonly LineupRow[] = LINEUP_SLOTS.map((slot) => ({
    slot,
    player: null,
    score: null,
    gp: null,
  }));
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const lineup = this.lineup();
      const moved = untracked(() => changedSlots(this.previous, lineup));
      // The pool's arrival fills every slot at once, and highlighting them all would say nothing:
      // the highlight is for a change the visitor caused to a card already filled.
      const arrival = this.previous.every((row) => row.player === null);
      this.previous = lineup;
      if (moved.length === 0 || arrival) {
        return;
      }
      this.changed.set(new Set(moved));
      if (this.holdTimer) {
        clearTimeout(this.holdTimer);
      }
      this.holdTimer = setTimeout(() => this.changed.set(new Set()), HIGHLIGHT_HOLD_MS);
    });
    this.destroyRef.onDestroy(() => {
      if (this.holdTimer) {
        clearTimeout(this.holdTimer);
      }
    });
  }

  protected readonly scoreHeading = computed(() =>
    this.scoringType() === 'points' ? 'Fan Pts' : 'Z-score',
  );

  protected selectScoringType(type: ScoringType): void {
    this.scoringType.set(type);
  }

  protected weight(key: ScoringStatKey): number {
    return this.weights()[key];
  }

  protected setWeight(key: ScoringStatKey, event: Event): void {
    const parsed = parseDecimalInput((event.target as HTMLInputElement).value);
    this.weights.update((weights) => ({ ...weights, [key]: parsed }));
  }

  protected formatScore(row: LineupRow): string {
    if (row.score === null) {
      return '';
    }
    return this.scoringType() === 'points' ? row.score.toFixed(1) : row.score.toFixed(2);
  }

  protected positionsOf(player: Player): readonly string[] {
    return player.type === 'skater' ? [...player.positions] : ['G'];
  }

  protected retry(): void {
    this.pool.reload();
  }
}
