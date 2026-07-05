import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { DraftSetupComponent, DraftSetupResult } from './draft-setup';
import { RosterSlots } from '../../api/models/roster-slots';
import { DEFAULT_ROSTER_SLOTS } from '../../draft-projection/projection-defaults';

describe('DraftSetupComponent', () => {
  beforeEach(() => MockBuilder(DraftSetupComponent));

  function renderSetup(rosterSlots: RosterSlots = DEFAULT_ROSTER_SLOTS): DraftSetupComponent {
    return MockRender(DraftSetupComponent, { initial: null, seedName: 'My Team', rosterSlots })
      .point.componentInstance;
  }

  it('seeds a default 12-team league with exactly one mine', () => {
    const component = renderSetup();

    expect(component.numTeams()).toEqual(12);
    const mine = component.rows().filter((row) => row.mine);
    expect(mine.length).toEqual(1);
    expect(mine[0].name).toEqual('My Team');
  });

  it('adds and removes teams', () => {
    const component = renderSetup();

    component.addTeam();
    expect(component.numTeams()).toEqual(13);

    component.removeTeam();
    expect(component.numTeams()).toEqual(12);
  });

  it('reorders teams', () => {
    const component = renderSetup();
    const firstId = component.rows()[0].id;
    const secondId = component.rows()[1].id;

    component.reorder(0, 1);

    expect(component.rows()[0].id).toEqual(secondId);
    expect(component.rows()[1].id).toEqual(firstId);
  });

  it('emits the draft and roster slots on submit', () => {
    const component = renderSetup();
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    expect(emitted?.draft.teams.length).toEqual(12);
    expect(emitted?.draft.order.length).toEqual(12);
    expect(emitted?.draft.teams.filter((team) => team.mine).length).toEqual(1);
    expect(emitted?.draft.picks).toEqual([]);
    expect(emitted?.rosterSlots).toEqual(DEFAULT_ROSTER_SLOTS);
  });

  it('emits the roster slots it was given', () => {
    const custom: RosterSlots = { c: 3, lw: 3, rw: 3, d: 5, util: 1, bn: 2, g: 2 };
    const component = renderSetup(custom);
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    expect(emitted?.rosterSlots).toEqual(custom);
  });
});
