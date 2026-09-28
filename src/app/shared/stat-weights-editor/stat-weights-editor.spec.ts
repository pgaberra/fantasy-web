import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { StatWeightsEditorComponent } from './stat-weights-editor';
import { DEFAULT_STAT_WEIGHTS } from '../../draft-projection/projection-defaults';
import { ScoringStatKey } from '../../models/stat-key.model';

describe('StatWeightsEditorComponent', () => {
  beforeEach(() => MockBuilder(StatWeightsEditorComponent));

  const render = (columns: ScoringStatKey[]) =>
    MockRender(StatWeightsEditorComponent, {
      statWeights: { ...DEFAULT_STAT_WEIGHTS },
      activeScoringColumns: new Set(columns),
    });

  it('asks for the stats that count, in the order the table runs them', () => {
    const component = render(['assists', 'goals']).point.componentInstance;

    expect(component.columns()).toEqual(['goals', 'assists']);
  });

  it('reads a typed comma as the decimal point', () => {
    const component = render(['goals']).point.componentInstance;
    const field = document.createElement('input');
    field.value = '4,5';

    component.onInput('goals', { target: field } as unknown as Event);

    expect(component.statWeights()['goals']).toEqual(4.5);
  });

  it('steps a weight on the arrow keys', () => {
    const component = render(['goals']).point.componentInstance;
    const field = document.createElement('input');
    field.value = '2';
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    Object.defineProperty(event, 'target', { value: field });

    component.onKeydown('goals', event);

    expect(component.statWeights()['goals']).toBeCloseTo(2.01);
    expect(field.value).toEqual('2.01');
  });

  it('says so when no stat counts yet', () => {
    const element: HTMLElement = render([]).nativeElement;

    expect(element.querySelector('.weights-empty')).not.toBeNull();
    expect(element.querySelector('.weight-input')).toBeNull();
  });
});
