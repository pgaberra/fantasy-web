import { MockBuilder, MockRender } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { DraftSetupComponent, DraftSetupResult } from './draft-setup';
import { RosterSlots } from '../../api/models/roster-slots';
import { DraftState } from '../../api/models/draft-state';
import { DraftSettings } from '../../api/models/draft-settings';
import {
  DEFAULT_ROSTER_SLOTS,
  DEFAULT_STAT_WEIGHTS,
} from '../../draft-projection/projection-defaults';

describe('DraftSetupComponent', () => {
  beforeEach(() => MockBuilder(DraftSetupComponent));

  /** A 12-team points league, as a draft stores it. */
  const leagueWith = (change: Partial<DraftSettings> = {}): DraftSettings => ({
    scoringType: 'points',
    statWeights: { ...DEFAULT_STAT_WEIGHTS },
    activeScoringColumns: ['goals', 'assists'],
    activeUtilityColumns: [],
    leagueSize: 12,
    rosterSlots: DEFAULT_ROSTER_SLOTS,
    minGoalieGames: 30,
    ...change,
  });

  function renderSetup(league: DraftSettings = leagueWith()): DraftSetupComponent {
    return MockRender(DraftSetupComponent, { initial: null, seedName: 'My Team', league }).point
      .componentInstance;
  }

  function confirmedBy(component: DraftSetupComponent): () => DraftSetupResult | undefined {
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });
    return () => emitted;
  }

  /** A league's board, taken before the league set its draft order: its team list, unordered. */
  const leagueBoard: DraftState = {
    teams: [
      { id: '465.l.9.t.2', name: 'Bravo', mine: false },
      { id: '465.l.9.t.1', name: 'Alpha', mine: true },
      { id: '465.l.9.t.3', name: 'Charlie', mine: false },
    ],
    order: ['465.l.9.t.2', '465.l.9.t.1', '465.l.9.t.3'],
    picks: [],
    following: true,
  };

  it('seeds a default 12-team league with exactly one mine', () => {
    const component = renderSetup();

    expect(component.numTeams()).toEqual(12);
    const mine = component.rows().filter((row) => row.mine);
    expect(mine.length).toEqual(1);
    expect(mine[0].name).toEqual('My Team');
  });

  it('seeds the team count from the projection league size', () => {
    const component = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      league: leagueWith({ leagueSize: 8 }),
    }).point.componentInstance;

    expect(component.numTeams()).toEqual(8);
    expect(component.rows().filter((row) => row.mine).length).toEqual(1);
  });

  it('adds and removes teams', () => {
    const component = renderSetup();

    component.addTeam();
    expect(component.numTeams()).toEqual(13);

    component.removeTeam();
    expect(component.numTeams()).toEqual(12);
  });

  it('moves your team to the chosen draft position, keeping the others in order', () => {
    const component = renderSetup();
    const others = component
      .rows()
      .filter((row) => !row.mine)
      .map((row) => row.id);

    component.setMyPosition(5);

    expect(component.myPosition()).toEqual(5);
    expect(
      component
        .rows()
        .filter((row) => !row.mine)
        .map((row) => row.id),
    ).toEqual(others);

    component.setMyPosition(99);
    expect(component.myPosition()).toEqual(12);
  });

  it('names the other teams by number, and your team by its own name', () => {
    const component = renderSetup();
    component.setMyPosition(2);
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    const names = emitted?.draft.order.map(
      (id) => emitted?.draft.teams.find((team) => team.id === id)?.name,
    );
    expect(names?.slice(0, 4)).toEqual(['Team 1', 'My Team', 'Team 2', 'Team 3']);
  });

  it('keeps your seat when a team is removed from behind it', () => {
    const component = renderSetup();
    component.setMyPosition(12);

    component.removeTeam();

    expect(component.numTeams()).toEqual(11);
    expect(component.myPosition()).toEqual(11);
  });

  it('emits the draft and its league on submit', () => {
    const component = renderSetup();
    component.setMyPosition(1);
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    expect(emitted?.draft.teams.length).toEqual(12);
    expect(emitted?.draft.order.length).toEqual(12);
    expect(emitted?.draft.teams.filter((team) => team.mine).length).toEqual(1);
    expect(emitted?.draft.picks).toEqual([]);
    expect(emitted?.league).toEqual(leagueWith());
  });

  it('emits the roster slots it was given', () => {
    const custom: RosterSlots = { c: 3, lw: 3, rw: 3, d: 5, util: 1, bn: 2, g: 2 };
    const component = renderSetup(leagueWith({ rosterSlots: custom }));
    component.setMyPosition(1);
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    component.submit();

    expect(emitted?.league.rosterSlots).toEqual(custom);
  });

  describe('the league', () => {
    // One number, not two: the size the board is ranked by is the teams it seats.
    it('is as big as the teams set up', () => {
      const component = renderSetup();
      const emitted = confirmedBy(component);
      component.setMyPosition(1);

      component.addTeam();
      component.submit();

      expect(emitted()?.draft.teams.length).toEqual(13);
      expect(emitted()?.league.leagueSize).toEqual(13);
    });

    it('scores the way it was set here', () => {
      const component = renderSetup();
      const emitted = confirmedBy(component);
      component.setMyPosition(1);

      component.setLeague({ ...component.editableLeague(), scoringType: 'category' });
      component.setStatWeights({ ...component.editableLeague().statWeights, goals: 6 });
      component.submit();

      expect(emitted()?.league.scoringType).toEqual('category');
      expect(emitted()?.league.statWeights['goals']).toEqual(6);
    });

    it('takes the size of a league imported here', () => {
      const component = renderSetup();

      component.setLeague({ ...component.editableLeague(), leagueSize: 8 });

      expect(component.numTeams()).toEqual(8);
      expect(component.rows().filter((row) => row.mine).length).toEqual(1);
    });

    it('keeps the teams that have picked when an import makes the league smaller', () => {
      const component = MockRender(DraftSetupComponent, {
        initial: {
          teams: [
            { id: 'team-me', name: 'My Team', mine: true },
            { id: 'team-1', name: 'Team 1', mine: false },
            { id: 'team-2', name: 'Team 2', mine: false },
          ],
          order: ['team-me', 'team-1', 'team-2'],
          picks: [{ playerId: 1, teamId: 'team-2' }],
        },
        seedName: 'My Team',
        league: leagueWith({ leagueSize: 3 }),
      }).point.componentInstance;

      component.setLeague({ ...component.editableLeague(), leagueSize: 2 });

      expect(component.rows().map((row) => row.id)).toEqual(['team-me', 'team-2']);
    });

    it('leaves the draft as it was until the setup is confirmed', () => {
      const league = leagueWith();
      const component = renderSetup(league);

      component.setLeague({ ...component.editableLeague(), scoringType: 'category' });

      expect(league.scoringType).toEqual('points');
    });

    it('asks for the points per stat only in a points league', () => {
      const fixture = MockRender(DraftSetupComponent, {
        initial: null,
        seedName: 'My Team',
        league: leagueWith(),
      });
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('app-stat-weights-editor')).not.toBeNull();

      fixture.point.componentInstance.setLeague({
        ...fixture.point.componentInstance.editableLeague(),
        scoringType: 'category',
      });
      fixture.detectChanges();

      expect(element.querySelector('app-stat-weights-editor')).toBeNull();
    });
  });

  // Nothing has told a fresh setup where the user drafts, so it starts on no seat at all.
  it('starts on no seat, and will not start the draft until one is chosen', () => {
    const component = renderSetup();
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    expect(component.draftPositionKnown()).toBe(false);
    component.submit();
    expect(emitted).toBeUndefined();
    expect(component.positionMissing()).toBe(true);

    component.setMyPosition(3);
    expect(component.positionMissing()).toBe(false);
    component.submit();
    expect(emitted?.draft.order.indexOf('team-me')).toBe(2);
  });

  it('keeps Start enabled, and points at the draft position when pressed without one', () => {
    const fixture = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      league: leagueWith(),
    });
    const element: HTMLElement = fixture.nativeElement;
    const component = fixture.point.componentInstance;
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });
    const select = element.querySelector<HTMLSelectElement>('#draft-position')!;
    const start = element.querySelector<HTMLButtonElement>('.btn-primary')!;

    expect(start.disabled).toBe(false);
    expect(element.querySelector('.field-error')).toBeNull();

    start.click();
    fixture.detectChanges();

    expect(emitted).toBeUndefined();
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Choose your draft position',
    );
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toBe('draft-position-error');
    expect(document.activeElement).toBe(select);

    select.value = '4';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(element.querySelector('.field-error')).toBeNull();
    expect(select.getAttribute('aria-invalid')).toBe('false');
    start.click();
    expect(emitted?.draft.order.indexOf('team-me')).toBe(3);
  });

  it('keeps the seat a saved setup already carries', () => {
    const component = MockRender(DraftSetupComponent, {
      initial: {
        teams: [
          { id: 'team-1', name: 'Team 1', mine: false },
          { id: 'team-me', name: 'My Team', mine: true },
        ],
        order: ['team-1', 'team-me'],
        picks: [],
      },
      seedName: 'My Team',
      league: leagueWith(),
    }).point.componentInstance;

    expect(component.draftPositionKnown()).toBe(true);
    expect(component.myPosition()).toEqual(2);
  });

  // Where the league listed the user second, before it had set its order, the second seat is the
  // list's and nobody's choice: the setup asks again, and offers no way back to a board that would
  // be drafted on it.
  it("asks for the seat again on a league's board the league has not ordered", () => {
    const fixture = MockRender(DraftSetupComponent, {
      initial: leagueBoard,
      positionKnown: false,
      seedName: 'My Team',
      league: leagueWith(),
    });
    const element: HTMLElement = fixture.nativeElement;
    const component = fixture.point.componentInstance;
    let emitted: DraftSetupResult | undefined;
    component.confirmed.subscribe((value) => {
      emitted = value;
    });

    expect(component.draftPositionKnown()).toBe(false);
    expect(element.querySelector('.setup-hint')?.textContent).toContain(
      "Your league hasn't set its draft order yet.",
    );
    expect(element.querySelector('#draft-position option:checked')?.textContent).toContain(
      'Select',
    );

    component.submit();
    expect(emitted).toBeUndefined();

    component.setMyPosition(3);
    component.submit();
    expect(emitted?.draft.order).toEqual(['465.l.9.t.2', '465.l.9.t.3', '465.l.9.t.1']);
    expect(emitted?.draft.teams.map((team) => team.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    // The sync switch goes off with the seat: a board set up here is drafted by hand.
    expect(emitted?.draft.following).toBeUndefined();
  });

  it('offers the league instead, where the page names a way to sync', () => {
    const fixture = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      league: leagueWith(),
      syncLabel: 'Sync picks from the Yahoo draft',
    });
    const element: HTMLElement = fixture.nativeElement;
    let requested = 0;
    fixture.point.componentInstance.syncRequested.subscribe(() => requested++);

    const sync = element.querySelector<HTMLButtonElement>('.setup-sync button')!;
    expect(sync.textContent).toContain('Sync picks from the Yahoo draft');
    sync.click();

    expect(requested).toBe(1);
  });

  it('offers no league where the page names none', () => {
    const element: HTMLElement = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      league: leagueWith(),
    }).nativeElement;

    expect(element.querySelector('.setup-sync')).toBeNull();
    expect(element.querySelector('.setup-notice')).toBeNull();
  });

  it("says why the league's draft could not be followed", () => {
    const element: HTMLElement = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      league: leagueWith(),
      notice: "Draft Mode can't follow an auction draft.",
    }).nativeElement;

    expect(element.querySelector('.setup-notice')?.textContent).toContain(
      "Draft Mode can't follow an auction draft.",
    );
  });
  // The page decides what Cancel means (back to the board, or off the page), so it is always there.
  it('offers Cancel on a new setup too', () => {
    const fixture = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      league: leagueWith(),
    });
    const element: HTMLElement = fixture.nativeElement;
    let cancelled = false;
    fixture.point.componentInstance.cancelled.subscribe(() => {
      cancelled = true;
    });

    const cancel = [...element.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Cancel',
    );
    cancel?.click();

    expect(cancelled).toBe(true);
  });

  describe('the name of a draft not saved yet', () => {
    const renderNamed = (draftName: string | null) =>
      MockRender(DraftSetupComponent, {
        initial: null,
        seedName: 'My Team',
        league: leagueWith(),
        draftName,
      });

    const type = (element: HTMLElement, value: string) => {
      const input = element.querySelector<HTMLInputElement>('#draft-name')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };

    it('asks no name for a saved draft, which is renamed from its heading', () => {
      const fixture = renderNamed(null);
      const component = fixture.point.componentInstance;
      const confirmed = confirmedBy(component);
      component.setMyPosition(1);

      component.submit();

      expect(fixture.nativeElement.querySelector('#draft-name')).toBeNull();
      expect(confirmed()?.name).toBeUndefined();
    });

    it('sends the name typed', () => {
      const fixture = renderNamed('AI Projection');
      fixture.detectChanges();
      const component = fixture.point.componentInstance;
      const confirmed = confirmedBy(component);
      component.setMyPosition(1);

      type(fixture.nativeElement, '  Mock #3 ');
      component.submit();

      expect(confirmed()?.name).toEqual('Mock #3');
    });

    // As an unnamed team keeps "Team N": a blank name is not one to create a draft under.
    it('keeps the proposed name when the field is cleared', () => {
      const fixture = renderNamed('AI Projection');
      fixture.detectChanges();
      const component = fixture.point.componentInstance;
      const confirmed = confirmedBy(component);
      component.setMyPosition(1);

      type(fixture.nativeElement, '   ');
      component.submit();

      expect(confirmed()?.name).toEqual('AI Projection');
    });

    // The page numbers its proposal once the user's drafts are read, which can be after the setup
    // opened: it fills the field until the user types, and never over what they typed.
    it('takes a later proposal until the user types, and not after', () => {
      const fixture = renderNamed('AI Projection');
      fixture.detectChanges();
      const component = fixture.point.componentInstance;

      fixture.componentInstance.draftName = 'AI Projection (2)';
      fixture.detectChanges();
      expect(component.nameValue()).toEqual('AI Projection (2)');

      type(fixture.nativeElement, 'Mock #3');
      fixture.componentInstance.draftName = 'AI Projection (3)';
      fixture.detectChanges();
      expect(component.nameValue()).toEqual('Mock #3');
    });
  });
});
