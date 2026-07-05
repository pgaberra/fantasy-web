import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { RosterSlotsEditorComponent } from './roster-slots-editor';
import { RosterSlots } from '../../api/models/roster-slots';

describe('RosterSlotsEditorComponent', () => {
  const DEFAULT_SLOTS: RosterSlots = { c: 2, lw: 2, rw: 2, d: 4, util: 0, bn: 4, g: 2 };

  beforeEach(() => MockBuilder(RosterSlotsEditorComponent));

  const getComponent = (rosterSlots: RosterSlots = DEFAULT_SLOTS) =>
    MockRender(RosterSlotsEditorComponent, { rosterSlots }).point.componentInstance;

  const inputEvent = (value: string) => ({ target: { value } }) as unknown as Event;

  it('updates a single roster slot and clamps it to 0..50', () => {
    const component = getComponent();

    component.onRosterSlotInput('d', inputEvent('6'));
    expect(component.rosterSlots().d).toEqual(6);
    expect(component.rosterSlots().c).toEqual(2);

    component.onRosterSlotInput('bn', inputEvent('99'));
    expect(component.rosterSlots().bn).toEqual(50);
  });

  it('ignores non-numeric input', () => {
    const component = getComponent();

    component.onRosterSlotInput('c', inputEvent('abc'));
    expect(component.rosterSlots().c).toEqual(2);
  });

  it('renders a slot input per position', () => {
    getComponent();

    expect(ngMocks.findAll('.roster-slot')).toHaveLength(7);
  });
});
