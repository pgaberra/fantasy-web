import { Component, computed, input, model } from '@angular/core';
import {
  SCORING_STAT_KEYS,
  SKATER_SCORING_STAT_KEYS,
  ScoringStatKey,
} from '../../models/stat-key.model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { StatTooltipPipe } from '../../pipes/stat-tooltip.pipe';
import { parseDecimalInput, steppedDecimalInput } from '../decimal-input';
import { TooltipDirective } from '../tooltip/tooltip.directive';

/** The same step the editor's weight row takes on an arrow key. */
const WEIGHT_STEP = 0.01;

const SKATER_KEYS: ReadonlySet<ScoringStatKey> = new Set(SKATER_SCORING_STAT_KEYS);

interface WeightGroup {
  readonly id: string;
  readonly heading: string;
  readonly columns: readonly ScoringStatKey[];
}

/**
 * A points league's points per stat, set without a table to stand them under: the draft setup,
 * where the league is set and no board is drawn. One field per stat that counts, in the order the
 * table's columns run, so the same stat is in the same place on the board that follows. Skater
 * stats and goalie stats stand under their own headings, as they sit in separate tables there.
 */
@Component({
  selector: 'app-stat-weights-editor',
  imports: [TooltipDirective, StatLabelPipe, StatTooltipPipe],
  templateUrl: './stat-weights-editor.html',
  styleUrl: './stat-weights-editor.css',
})
export class StatWeightsEditorComponent {
  readonly statWeights = model.required<Record<ScoringStatKey, number>>();
  readonly activeScoringColumns = input.required<ReadonlySet<ScoringStatKey>>();

  readonly columns = computed(() =>
    SCORING_STAT_KEYS.filter((key) => this.activeScoringColumns().has(key)),
  );

  /**
   * The stats that count, split by who earns them; a group with nothing in it is left out. Time
   * on ice is one weight scored for both, and is asked for once, among the skaters.
   */
  readonly groups = computed<WeightGroup[]>(() => {
    const skaters = this.columns().filter((key) => SKATER_KEYS.has(key));
    const goalies = this.columns().filter((key) => !SKATER_KEYS.has(key));
    return [
      { id: 'weights-skaters', heading: 'Skaters', columns: skaters },
      { id: 'weights-goalies', heading: 'Goalies', columns: goalies },
    ].filter((group) => group.columns.length > 0);
  });

  /** A weight is replaced more often than it is amended, so the field arrives selected. */
  onFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  onInput(statKey: ScoringStatKey, event: Event): void {
    this.setWeight(statKey, parseDecimalInput((event.target as HTMLInputElement).value));
  }

  onKeydown(statKey: ScoringStatKey, event: KeyboardEvent): void {
    const field = event.target as HTMLInputElement;
    const stepped = steppedDecimalInput(field.value, event.key, WEIGHT_STEP);
    if (stepped === null) {
      return;
    }
    // The arrow would otherwise jump the caret to the end of the text it just changed.
    event.preventDefault();
    field.value = `${stepped}`;
    this.setWeight(statKey, stepped);
  }

  /** A field left half-typed goes back to the weight that is stored, as the weight row's do. */
  onBlur(statKey: ScoringStatKey, event: Event): void {
    (event.target as HTMLInputElement).value = `${this.statWeights()[statKey]}`;
  }

  private setWeight(statKey: ScoringStatKey, weight: number): void {
    this.statWeights.update((weights) => ({ ...weights, [statKey]: weight }));
  }
}
