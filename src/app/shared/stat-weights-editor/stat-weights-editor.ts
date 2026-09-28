import { Component, computed, input, model } from '@angular/core';
import { SCORING_STAT_KEYS, ScoringStatKey } from '../../models/stat-key.model';
import { StatLabelPipe } from '../../pipes/stat-label.pipe';
import { StatTooltipPipe } from '../../pipes/stat-tooltip.pipe';
import { parseDecimalInput, steppedDecimalInput } from '../decimal-input';

/** The same step the editor's weight row takes on an arrow key. */
const WEIGHT_STEP = 0.01;

/**
 * A points league's points per stat, set without a table to stand them under: the draft setup,
 * where the league is set and no board is drawn. One field per stat that counts, in the order the
 * table's columns run, so the same stat is in the same place on the board that follows.
 */
@Component({
  selector: 'app-stat-weights-editor',
  imports: [StatLabelPipe, StatTooltipPipe],
  templateUrl: './stat-weights-editor.html',
  styleUrl: './stat-weights-editor.css',
})
export class StatWeightsEditorComponent {
  readonly statWeights = model.required<Record<ScoringStatKey, number>>();
  readonly activeScoringColumns = input.required<ReadonlySet<ScoringStatKey>>();

  readonly columns = computed(() =>
    SCORING_STAT_KEYS.filter((key) => this.activeScoringColumns().has(key)),
  );

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
