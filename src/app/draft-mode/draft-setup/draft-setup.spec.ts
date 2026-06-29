import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { DraftSetupComponent } from './draft-setup';
import { DraftState } from '../../api/models/draft-state';

describe('DraftSetupComponent', () => {
  beforeEach(() => MockBuilder(DraftSetupComponent));

  function renderSetup(): DraftSetupComponent {
    return MockRender(DraftSetupComponent, { initial: null, seedName: 'My Team' }).point
      .componentInstance;
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

  it('emits a valid draft on submit', () => {
    const component = renderSetup();
    let emitted: DraftState | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    expect(emitted?.teams.length).toEqual(12);
    expect(emitted?.order.length).toEqual(12);
    expect(emitted?.teams.filter((team) => team.mine).length).toEqual(1);
    expect(emitted?.picks).toEqual([]);
  });
});
