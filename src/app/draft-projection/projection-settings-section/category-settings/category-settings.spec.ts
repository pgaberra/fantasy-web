import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { CategorySettingsComponent } from './category-settings';
import { SettingRowComponent } from '../setting-row/setting-row';
import { RosterSlots } from '../../../api/models/roster-slots';

describe('CategorySettingsComponent', () => {
  const DEFAULT_SLOTS: RosterSlots = { c: 2, lw: 2, rw: 2, d: 4, util: 0, bn: 4, g: 2 };

  beforeEach(() => MockBuilder(CategorySettingsComponent).keep(SettingRowComponent));

  const getComponent = (rosterSlots: RosterSlots = DEFAULT_SLOTS) =>
    MockRender(CategorySettingsComponent, {
      leagueSize: 12,
      rosterSlots,
    }).point.componentInstance;

  const inputEvent = (value: string) => ({ target: { value } }) as unknown as Event;

  it('clamps the number of teams to 2..30', () => {
    const component = getComponent();

    component.onLeagueSizeInput(inputEvent('1'));
    expect(component.leagueSize()).toEqual(2);

    component.onLeagueSizeInput(inputEvent('40'));
    expect(component.leagueSize()).toEqual(30);

    component.onLeagueSizeInput(inputEvent('14'));
    expect(component.leagueSize()).toEqual(14);
  });

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

    component.onLeagueSizeInput(inputEvent('abc'));
    expect(component.leagueSize()).toEqual(12);
  });

  it('renders the teams input and a slot per position', () => {
    getComponent();

    expect(ngMocks.find('.league-size-input')).toBeTruthy();
    expect(ngMocks.findAll('.roster-slot')).toHaveLength(7);
  });
});
