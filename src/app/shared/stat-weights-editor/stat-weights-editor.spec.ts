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

  it('keeps skater stats and goalie stats under their own headings', () => {
    const element: HTMLElement = render(['w', 'goals', 'sv', 'hits']).nativeElement;

    const groups = [...element.querySelectorAll('.weight-group')].map((group) => ({
      heading: group.querySelector('.weight-group-heading')?.textContent?.trim(),
      fields: [...group.querySelectorAll('.weight-input')].map((field) => field.id),
    }));

    expect(groups).toEqual([
      { heading: 'Skaters', fields: ['weight-goals', 'weight-hits'] },
      { heading: 'Goalies', fields: ['weight-w', 'weight-sv'] },
    ]);
  });

  it('leaves out the heading of a group with no stat that counts', () => {
    const element: HTMLElement = render(['goals']).nativeElement;

    const headings = [...element.querySelectorAll('.weight-group-heading')].map((heading) =>
      heading.textContent?.trim(),
    );

    expect(headings).toEqual(['Skaters']);
  });

  it('selects the weight in a field that takes focus, so typing replaces it', () => {
    const component = render(['goals']).point.componentInstance;
    const field = document.createElement('input');
    field.value = '4.5';
    document.body.appendChild(field);

    component.onFocus({ target: field } as unknown as Event);

    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
    field.remove();
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
