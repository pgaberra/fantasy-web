import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { DraftSetupComponent, DraftSetupResult } from './draft-setup';
import { RosterSlots } from '../../api/models/roster-slots';
import { DraftState } from '../../api/models/draft-state';
import { DraftSettings } from '../../api/models/draft-settings';
import { LeagueDraftResponse } from '../../api/models/league-draft-response';
import { LeagueProjectionSettingsResponse } from '../../api/models/league-projection-settings-response';
import { LeagueSyncComponent } from '../../draft-projection/projection-settings-section/league-sync/league-sync';
import { RosterSlotsEditorComponent } from '../../shared/roster-slots-editor/roster-slots-editor';
import { FollowedLeague } from '../league-draft-follow';
import { SyncWarningDialogComponent } from '../../draft-projection/sync-warning-dialog/sync-warning-dialog';
import { HelpTipComponent } from '../../shared/help-tip/help-tip';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
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

  /** A setup with the number of teams chosen, which a fresh one opens without. */
  function renderSetup(
    league: DraftSettings = leagueWith(),
    teams: number | null = 12,
  ): DraftSetupComponent {
    const component = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      league,
    }).point.componentInstance;
    if (teams !== null) {
      component.setTeamCount(teams);
    }
    return component;
  }

  /** What a league answers an import with, as big as said. */
  const importOf = (leagueSize: number | undefined): LeagueProjectionSettingsResponse => ({
    scoringType: 'points',
    activeScoringColumns: ['goals', 'assists'],
    activeUtilityColumns: [],
    leagueSize,
    rosterSlots: DEFAULT_ROSTER_SLOTS,
    unsupportedRosterCodes: [],
    unsupportedStats: [],
  });

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

  it('starts on no number of teams, and no team of yours', () => {
    const component = renderSetup(leagueWith(), null);

    expect(component.teamCountKnown()).toBe(false);
    expect(component.numTeams()).toBeNull();
    expect(component.rows().some((row) => row.mine)).toBe(false);
  });

  // The size a projection carries may be nothing but its default, so it is not taken as chosen.
  it('does not take the team count from a league nobody imported', () => {
    const component = renderSetup(leagueWith({ leagueSize: 8 }), null);

    expect(component.numTeams()).toBeNull();
  });

  it('takes the team count of a league imported earlier', () => {
    const component = renderSetup(
      leagueWith({
        leagueSize: 8,
        yahooSync: { leagueName: 'Beer League', leagueKey: '465.l.9', syncedAt: 'then' },
      }),
      null,
    );

    expect(component.numTeams()).toEqual(8);
    expect(component.rows().some((row) => row.mine)).toBe(false);
  });

  it('sets the number of teams to the one chosen, up or down', () => {
    const component = renderSetup();
    component.setMyPosition(12);

    component.setTeamCount(14);
    expect(component.numTeams()).toEqual(14);

    component.setTeamCount(10);
    expect(component.numTeams()).toEqual(10);
    expect(component.rows().filter((row) => row.mine).length).toEqual(1);
  });

  it('will not start the draft until the number of teams is chosen, and asks for it first', () => {
    const fixture = MockRender(DraftSetupComponent, {
      initial: null,
      seedName: 'My Team',
      league: leagueWith(),
    });
    const element: HTMLElement = fixture.nativeElement;
    const emitted = confirmedBy(fixture.point.componentInstance);
    const teams = element.querySelector<HTMLSelectElement>('#draft-teams')!;
    const start = element.querySelector<HTMLButtonElement>('.btn-primary')!;

    expect(element.querySelector('#draft-teams option:checked')?.textContent).toContain('Select');
    // No teams, no seats to offer.
    expect(element.querySelector('.team-you')).toBeNull();

    start.click();
    fixture.detectChanges();

    expect(emitted()).toBeUndefined();
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Choose the number of teams',
    );
    expect(teams.getAttribute('aria-invalid')).toBe('true');
    expect(teams.getAttribute('aria-describedby')).toBe('draft-teams-error');
    expect(document.activeElement).toBe(teams);

    teams.value = '10';
    teams.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(element.querySelector('.field-error')).toBeNull();
    const seats = element.querySelectorAll<HTMLButtonElement>('.team-you');
    expect(seats.length).toBe(10);

    seats[3].click();
    start.click();
    expect(emitted()?.draft.teams.length).toBe(10);
    expect(emitted()?.league.leagueSize).toBe(10);
  });

  it('offers no size smaller than the teams that have picked', () => {
    const component = MockRender(DraftSetupComponent, {
      initial: {
        teams: [
          { id: 'team-me', name: 'My Team', mine: true },
          { id: 'team-1', name: 'Team 1', mine: false },
          { id: 'team-2', name: 'Team 2', mine: false },
          { id: 'team-3', name: 'Team 3', mine: false },
        ],
        order: ['team-me', 'team-1', 'team-2', 'team-3'],
        picks: [
          { playerId: 1, teamId: 'team-2' },
          { playerId: 2, teamId: 'team-3' },
        ],
      },
      seedName: 'My Team',
      league: leagueWith({ leagueSize: 4 }),
    }).point.componentInstance;

    expect(component.numTeams()).toEqual(4);
    expect(component.teamCounts()[0]).toEqual(3);
  });

  it('makes the team at the seat pressed yours, and under your name where it had none', () => {
    const component = renderSetup();
    const ids = component.rows().map((row) => row.id);

    component.setMyPosition(3);

    expect(component.myPosition()).toEqual(3);
    expect(component.rows().map((row) => row.id)).toEqual(ids);
    expect(component.rows()[2].name).toEqual('My Team');
    expect(component.rows().filter((row) => row.mine).length).toEqual(1);
  });

  it('moves your team to the seat pressed next, keeping the others in order', () => {
    const component = renderSetup();
    component.setMyPosition(1);
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

  // A draft no league is telling about: only the user knows who is in it and in what order.
  describe('the teams in their draft order', () => {
    /** A fresh setup with the size and the seat chosen, drawn. */
    function renderList(teams = 4, seat = 2) {
      const fixture = MockRender(DraftSetupComponent, {
        initial: null,
        seedName: 'Puck Luck',
        league: leagueWith(),
      });
      const component = fixture.point.componentInstance;
      component.setTeamCount(teams);
      component.setMyPosition(seat);
      fixture.detectChanges();
      return { fixture, component, element: fixture.nativeElement as HTMLElement };
    }

    const namesOf = (result: DraftSetupResult | undefined) =>
      result?.draft.order.map((id) => result.draft.teams.find((team) => team.id === id)?.name);

    it('is listed once the number of teams is chosen, with no team yours until pressed', () => {
      const fixture = MockRender(DraftSetupComponent, {
        initial: null,
        seedName: 'My Team',
        league: leagueWith(),
      });
      const element: HTMLElement = fixture.nativeElement;
      const component = fixture.point.componentInstance;
      expect(element.querySelector('.team-list')).toBeNull();

      component.setTeamCount(4);
      fixture.detectChanges();
      const rows = () => [...element.querySelectorAll('.team-row')];
      expect(rows().length).toBe(4);
      // Your team would sit in a seat nobody chose.
      expect(element.querySelector('.team-row--mine')).toBeNull();
      expect(element.querySelector('[aria-pressed="true"]')).toBeNull();
      expect(element.querySelector('.order-hint')?.textContent).toContain('Press You');
      expect(
        rows().map((row) => row.querySelector<HTMLInputElement>('.team-name')?.placeholder),
      ).toEqual(['Team 1', 'Team 2', 'Team 3', 'Team 4']);

      rows()[2].querySelector<HTMLButtonElement>('.team-you')!.click();
      fixture.detectChanges();
      expect(rows()[2].classList).toContain('team-row--mine');
      expect(rows()[2].querySelector('.team-you')?.getAttribute('aria-pressed')).toBe('true');
      expect(element.querySelectorAll('[aria-pressed="true"]').length).toBe(1);
      expect(element.querySelector('.order-hint')).toBeNull();

      // Pressed on another team, yours moves there and the others close up around it.
      rows()[0].querySelector<HTMLButtonElement>('.team-you')!.click();
      fixture.detectChanges();
      expect(component.myPosition()).toBe(1);
      expect(rows()[0].querySelector<HTMLInputElement>('.team-name')?.value).toBe('My Team');
      expect(element.querySelectorAll('[aria-pressed="true"]').length).toBe(1);
    });

    it('shows each blank field the name it will be saved as', () => {
      const { element } = renderList(4, 2);

      const fields = [...element.querySelectorAll<HTMLInputElement>('.team-name')];
      expect(fields.map((field) => field.value)).toEqual(['', 'Puck Luck', '', '']);
      expect(fields.map((field) => field.placeholder)).toEqual([
        'Team 1',
        'My Team',
        'Team 2',
        'Team 3',
      ]);
      expect(fields[1].getAttribute('aria-label')).toBe('Your team, draft position 2');
    });

    it('saves the names typed, and the blank ones as "Team N"', () => {
      const { fixture, component, element } = renderList(4, 2);
      const emitted = confirmedBy(component);
      const fields = element.querySelectorAll<HTMLInputElement>('.team-name');

      fields[0].value = 'Ice Holes';
      fields[0].dispatchEvent(new Event('input'));
      fields[3].value = '  Beer Leaguers ';
      fields[3].dispatchEvent(new Event('input'));
      fixture.detectChanges();
      component.submit();

      expect(namesOf(emitted())).toEqual(['Ice Holes', 'Puck Luck', 'Team 2', 'Beer Leaguers']);
      expect(
        emitted()
          ?.draft.teams.filter((team) => team.mine)
          .map((team) => team.name),
      ).toEqual(['Puck Luck']);
    });

    it('reorders the teams by drag, and your draft position follows your team', () => {
      const { component } = renderList(4, 2);
      const emitted = confirmedBy(component);
      const ids = component.rows().map((row) => row.id);

      component.drop({ previousIndex: 1, currentIndex: 3 } as CdkDragDrop<unknown>);

      expect(component.rows().map((row) => row.id)).toEqual([ids[0], ids[2], ids[3], ids[1]]);
      expect(component.myPosition()).toBe(4);
      expect(component.moveAnnouncement()).toBe('Puck Luck moved to position 4 of 4.');
      component.submit();
      expect(emitted()?.draft.order).toEqual([ids[0], ids[2], ids[3], ids[1]]);
    });

    it('moves a team by keyboard from its handle, and keeps the focus on it', async () => {
      const { fixture, component, element } = renderList(4, 2);
      const moved = component.rows()[0].id;
      const handle = () =>
        element.querySelector<HTMLButtonElement>(`.drag-handle[data-team-id="${moved}"]`)!;
      handle().focus();

      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.rows()[1].id).toBe(moved);
      expect(component.myPosition()).toBe(1);
      expect(document.activeElement).toBe(handle());
      expect(handle().getAttribute('aria-label')).toBe('Move Team 1, position 2 of 4');

      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      fixture.detectChanges();
      expect(component.rows()[3].id).toBe(moved);

      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      fixture.detectChanges();
      expect(component.rows()[0].id).toBe(moved);

      // A held key repeats before the list is drawn again: each press still moves the same team.
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(component.rows()[2].id).toBe(moved);
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      fixture.detectChanges();

      // Already at the top: nothing moves, and nothing is said.
      component.moveAnnouncement.set('');
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(component.rows()[0].id).toBe(moved);
      expect(component.moveAnnouncement()).toBe('');
    });

    it("keeps an existing draft's teams and names, and marks the teams that have picked", () => {
      const fixture = MockRender(DraftSetupComponent, {
        initial: {
          teams: [
            { id: 'team-me', name: 'Puck Luck', mine: true },
            { id: 'team-1', name: 'Ice Holes', mine: false },
            { id: 'team-2', name: 'Team 2', mine: false },
          ],
          order: ['team-1', 'team-me', 'team-2'],
          picks: [{ playerId: 1, teamId: 'team-1' }],
        },
        seedName: 'My Team',
        league: leagueWith({ leagueSize: 3 }),
      });
      const element: HTMLElement = fixture.nativeElement;
      const emitted = confirmedBy(fixture.point.componentInstance);

      const rows = [...element.querySelectorAll('.team-row')];
      expect(rows.map((row) => row.querySelector<HTMLInputElement>('.team-name')?.value)).toEqual([
        'Ice Holes',
        'Puck Luck',
        'Team 2',
      ]);
      expect(rows[0].querySelector('.team-badge')?.textContent?.trim()).toBe('Drafted');
      expect(rows[2].querySelector('.team-badge')).toBeNull();
      expect(rows[1].querySelector('.team-you')?.getAttribute('aria-pressed')).toBe('true');

      fixture.point.componentInstance.submit();
      expect(emitted()?.draft.teams).toEqual([
        { id: 'team-1', name: 'Ice Holes', mine: false },
        { id: 'team-me', name: 'Puck Luck', mine: true },
        { id: 'team-2', name: 'Team 2', mine: false },
      ]);
      expect(emitted()?.draft.picks).toEqual([{ playerId: 1, teamId: 'team-1' }]);
    });

    it('keeps the names typed when the number of teams grows, and drops from the end', () => {
      const { component } = renderList(3, 1);
      component.onTeamNameInput(1, { target: { value: 'Ice Holes' } } as unknown as Event);

      component.setTeamCount(5);
      expect(component.rows().map((row) => row.name)).toEqual([
        'Puck Luck',
        'Ice Holes',
        '',
        '',
        '',
      ]);

      component.setTeamCount(2);
      expect(component.rows().map((row) => row.name)).toEqual(['Puck Luck', 'Ice Holes']);
    });
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

      component.setTeamCount(13);
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

    it('sets the goalie minimum in the scoring section of a category league only', () => {
      const fixture = MockRender(DraftSetupComponent, {
        initial: null,
        seedName: 'My Team',
        league: leagueWith(),
      });
      const field = () => fixture.nativeElement.querySelector('#min-goalie-games-input');
      expect(field()).toBeNull();

      const component = fixture.point.componentInstance;
      component.setLeague({ ...component.editableLeague(), scoringType: 'category' });
      fixture.detectChanges();
      expect(field()).not.toBeNull();

      field().value = '99';
      field().dispatchEvent(new Event('input'));
      const emitted = confirmedBy(component);
      component.setTeamCount(12);
      component.setMyPosition(1);
      component.submit();

      expect(emitted()?.league.minGoalieGames).toEqual(84);
    });

    it('takes the size of a league imported here', () => {
      const component = renderSetup(leagueWith(), null);

      component.applyYahoo({
        settings: importOf(8),
        leagueName: 'Beer League',
        leagueKey: '465.l.9',
      });

      expect(component.numTeams()).toEqual(8);
      // The league said how big it is, not where the user sits.
      expect(component.draftPositionKnown()).toBe(false);
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

      component.applyYahoo({
        settings: importOf(2),
        leagueName: 'Beer League',
        leagueKey: '465.l.9',
      });

      expect(component.rows().map((row) => row.id)).toEqual(['team-me', 'team-2']);
    });

    it('leaves the number of teams to be chosen when the league does not report its size', () => {
      const component = renderSetup(leagueWith(), null);

      component.applyEspn({ settings: importOf(undefined), leagueName: 'Pond', leagueId: '123' });

      expect(component.numTeams()).toBeNull();
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
    const mine = emitted?.draft.teams.find((team) => team.mine);
    expect(emitted?.draft.order.indexOf(mine!.id)).toBe(2);
  });

  it('keeps Start enabled, and points at the You buttons when pressed without a seat', () => {
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
    component.setTeamCount(12);
    fixture.detectChanges();
    const list = element.querySelector<HTMLOListElement>('.team-list')!;
    const seats = element.querySelectorAll<HTMLButtonElement>('.team-you');
    const start = element.querySelector<HTMLButtonElement>('.btn-primary')!;

    expect(start.disabled).toBe(false);
    expect(element.querySelector('.field-error')).toBeNull();

    start.click();
    fixture.detectChanges();

    expect(emitted).toBeUndefined();
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Press You at your draft position',
    );
    expect(list.getAttribute('aria-describedby')).toBe('draft-position-error');
    expect(document.activeElement).toBe(seats[0]);

    seats[3].click();
    fixture.detectChanges();

    expect(element.querySelector('.field-error')).toBeNull();
    expect(list.getAttribute('aria-describedby')).toBeNull();
    start.click();
    const mine = emitted?.draft.teams.find((team) => team.mine);
    expect(emitted?.draft.order.indexOf(mine!.id)).toBe(3);
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
    // The league's teams as it listed them, and yours not marked where it happened to list you.
    const rows = [...element.querySelectorAll('.team-row')];
    expect(rows.map((row) => row.querySelector<HTMLInputElement>('.team-name')?.value)).toEqual([
      'Bravo',
      'Alpha',
      'Charlie',
    ]);
    expect(element.querySelector('.team-row--mine')).toBeNull();
    expect(element.querySelector('[aria-pressed="true"]')).toBeNull();

    component.submit();
    expect(emitted).toBeUndefined();

    // Your own team, Alpha, goes to the seat pressed: it stays yours, only its seat was unknown.
    component.setMyPosition(3);
    component.submit();
    expect(emitted?.draft.order).toEqual(['465.l.9.t.2', '465.l.9.t.3', '465.l.9.t.1']);
    expect(emitted?.draft.teams.map((team) => team.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    // The sync switch goes off with the seat: a board set up here is drafted by hand.
    expect(emitted?.draft.following).toBeUndefined();
  });

  describe('the league and syncing its picks', () => {
    const yahooSync = { leagueName: 'Beer League', leagueKey: '465.l.9', syncedAt: 'then' };
    const espnSync = { leagueName: 'Pond League', leagueId: '123', syncedAt: 'then' };
    const imported: LeagueProjectionSettingsResponse = {
      scoringType: 'category',
      activeScoringColumns: ['goals', 'hits'],
      activeUtilityColumns: [],
      leagueSize: 10,
      rosterSlots: { c: 1, lw: 1, rw: 1, d: 2, util: 1, bn: 3, g: 1 },
      unsupportedRosterCodes: [],
      unsupportedStats: [],
    };
    /** The league's draft as it answers: three teams, the user's second, order set or not. */
    const answered = (orderKnown = true): LeagueDraftResponse => ({
      status: 'PRE_DRAFT',
      auction: false,
      orderKnown,
      teams: leagueBoard.teams,
      picks: [],
    });

    const render = (params: Record<string, unknown> = {}) =>
      MockRender(DraftSetupComponent, {
        initial: null,
        seedName: 'My Team',
        league: leagueWith(),
        syncPlatforms: ['Yahoo'],
        following: false,
        syncCheck: { state: 'idle' },
        draftName: null as string | null,
        ...params,
      });

    const checksAskedOf = (component: DraftSetupComponent): FollowedLeague[] => {
      const asked: FollowedLeague[] = [];
      component.syncCheckRequested.subscribe((league) => asked.push(league));
      return asked;
    };

    it('is headed Draft Settings, with everything set by hand until a league is imported', () => {
      const fixture = render();
      const element: HTMLElement = fixture.nativeElement;
      const component = fixture.point.componentInstance;

      expect(element.querySelector('h2')?.textContent).toContain('Draft Settings');
      expect(component.linked()).toBeNull();
      expect(component.locked()).toBe(false);
      expect(element.querySelector('.sync-row')).toBeNull();
      expect(element.querySelector('.locked-note')).toBeNull();
      expect(element.querySelector<HTMLSelectElement>('#draft-teams')?.disabled).toBe(false);
      expect(component.numTeams()).toBeNull();
    });

    it('takes the scoring of an imported Yahoo league, switches syncing on and asks about its draft', () => {
      const fixture = render();
      const component = fixture.point.componentInstance;
      const asked = checksAskedOf(component);

      component.applyYahoo({ settings: imported, leagueName: 'Beer League', leagueKey: '465.l.9' });
      fixture.detectChanges();

      expect(component.editableLeague().scoringType).toBe('category');
      expect(component.syncOn()).toBe(true);
      expect(asked).toEqual([{ platform: 'Yahoo', id: '465.l.9', name: 'Beer League' }]);
      // The switch is named in a word, and what it does is left to its tip.
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('.sync-title')?.textContent?.trim()).toBe('Auto-sync');
      expect(ngMocks.findInstance(HelpTipComponent).text()).toBe(
        'Automatically update this page with picks from your draft.',
      );
      // Nothing is locked on a league nobody has heard from.
      expect(component.locked()).toBe(false);
      expect(component.numTeams()).toBe(10);
    });

    it('holds the start while the league is asked', () => {
      const fixture = render({
        league: leagueWith({ yahooSync }),
        following: true,
        syncCheck: { state: 'checking' },
      });
      const component = fixture.point.componentInstance;
      const confirmed = confirmedBy(component);

      component.submit();

      expect(component.syncChecking()).toBe(true);
      expect(confirmed()).toBeUndefined();
      expect((fixture.nativeElement as HTMLElement).querySelector('.sync-status')).not.toBeNull();
    });

    it('locks the teams, the seat and the roster to the league once it has answered', () => {
      const fixture = render({
        league: leagueWith({ yahooSync }),
        following: true,
        syncCheck: { state: 'ok', league: answered() },
      });
      const element: HTMLElement = fixture.nativeElement;
      const component = fixture.point.componentInstance;
      const confirmed = confirmedBy(component);

      expect(component.locked()).toBe(true);
      expect(component.numTeams()).toBe(3);
      expect(component.leaguePosition()).toBe(2);
      expect(element.querySelector('.locked-note strong')?.textContent?.trim()).toBe('Beer League');
      const teams = element.querySelector<HTMLSelectElement>('#draft-teams')!;
      expect(teams.disabled).toBe(true);
      expect(teams.textContent).toContain('3');
      expect(ngMocks.findInstance(RosterSlotsEditorComponent).disabled()).toBe(true);
      // The league's teams in its order, to read and not to change.
      const rows = [...element.querySelectorAll('.team-row')];
      expect(rows.map((row) => row.querySelector('.team-name')?.textContent?.trim())).toEqual([
        'Bravo',
        'Alpha',
        'Charlie',
      ]);
      expect(rows[1].querySelector('.team-badge--mine')).not.toBeNull();
      expect(element.querySelector('.drag-handle')).toBeNull();
      expect(element.querySelector('input.team-name')).toBeNull();
      expect(element.querySelector('.team-you')).toBeNull();

      // No seat to choose: the league's is the seat.
      component.submit();
      expect(confirmed()?.follow).toBe(true);
      expect(confirmed()?.league.leagueSize).toBe(3);
    });

    it('shows no seat for a league that has not set its draft order', () => {
      const fixture = render({
        league: leagueWith({ yahooSync }),
        following: true,
        syncCheck: { state: 'ok', league: answered(false) },
      });
      const element: HTMLElement = fixture.nativeElement;

      expect(fixture.point.componentInstance.leaguePosition()).toBeNull();
      expect(element.querySelector('app-notice')?.textContent).toContain(
        'Your draft position will be available when the draft starts',
      );
      // The league's list is not its order yet, so it is not drawn as one.
      expect(element.querySelector('.team-list')).toBeNull();
    });

    it('hands the three back to the user when syncing is switched off, and asks again when on', () => {
      const fixture = render({
        initial: leagueBoard,
        positionKnown: false,
        league: leagueWith({ yahooSync }),
        following: true,
        syncCheck: { state: 'ok', league: answered(false) },
      });
      const component = fixture.point.componentInstance;
      const asked = checksAskedOf(component);
      const confirmed = confirmedBy(component);

      component.toggleSync();
      fixture.detectChanges();

      expect(component.syncOn()).toBe(false);
      expect(component.locked()).toBe(false);
      // The seat the league listed is nobody's choice, so it is asked for.
      component.submit();
      expect(confirmed()).toBeUndefined();
      component.setMyPosition(1);
      component.submit();
      expect(confirmed()?.follow).toBe(false);

      component.toggleSync();
      expect(asked).toEqual([{ platform: 'Yahoo', id: '465.l.9', name: 'Beer League' }]);
    });

    it('says why a league cannot be synced, shows the switch off and leaves the three by hand', () => {
      const fixture = render({
        league: leagueWith({ yahooSync }),
        following: true,
        syncCheck: { state: 'failed', notice: "Draft Mode can't follow an auction draft." },
      });
      const element: HTMLElement = fixture.nativeElement;
      const component = fixture.point.componentInstance;
      const asked = checksAskedOf(component);

      expect(component.syncOn()).toBe(false);
      expect(component.locked()).toBe(false);
      expect(element.querySelector('.sync-status--warn')?.textContent).toContain(
        "Draft Mode can't follow an auction draft.",
      );

      // Switching it on asks the league once more.
      component.toggleSync();
      expect(asked.length).toBe(1);
    });

    it('takes the scoring of an ESPN league and leaves the rest by hand, with no switch', () => {
      const fixture = render();
      const element: HTMLElement = fixture.nativeElement;
      const component = fixture.point.componentInstance;
      const asked = checksAskedOf(component);
      const confirmed = confirmedBy(component);

      component.applyEspn({ settings: imported, leagueName: 'Pond League', leagueId: '123' });
      fixture.detectChanges();

      expect(component.editableLeague().scoringType).toBe('category');
      expect(component.linked()?.platform).toBe('ESPN');
      expect(component.syncOffered()).toBe(false);
      expect(component.syncOn()).toBe(false);
      expect(asked).toEqual([]);
      expect(element.querySelector('.sync-row')).toBeNull();
      expect(element.textContent).toContain("Picks can't be synced from ESPN yet");
      expect(element.querySelectorAll('.team-you').length).toBe(10);

      component.setMyPosition(4);
      component.submit();
      expect(confirmed()?.follow).toBe(false);
      expect(confirmed()?.league.espnSync?.leagueId).toBe('123');
    });

    it("offers the switch for an ESPN league where ESPN's drafts are followed", () => {
      const component = render({
        league: leagueWith({ espnSync }),
        syncPlatforms: ['Yahoo', 'ESPN'],
      }).point.componentInstance;

      expect(component.syncOffered()).toBe(true);
    });

    it('names a draft not saved yet after the imported league, unless a name was typed', () => {
      const named = render({ draftName: 'AI Projection (7)' }).point.componentInstance;
      named.applyYahoo({ settings: imported, leagueName: 'Beer League', leagueKey: '465.l.9' });
      expect(named.nameValue()).toBe('Beer League');

      const typed = render({ draftName: 'AI Projection (7)' }).point.componentInstance;
      typed.onNameInput({ target: { value: 'Mock #3' } } as unknown as Event);
      typed.applyYahoo({ settings: imported, leagueName: 'Beer League', leagueKey: '465.l.9' });
      expect(typed.nameValue()).toBe('Mock #3');
    });

    it('draws the import in the settings, open on Yahoo when a connect has just come back', () => {
      const fixture = render({ openImport: true });

      expect(ngMocks.findInstance(LeagueSyncComponent).openOnYahoo()).toBe(true);
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Import league');
      expect(ngMocks.findInstance(render().point, LeagueSyncComponent).openOnYahoo()).toBe(false);
    });
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
      component.setTeamCount(12);
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
      component.setTeamCount(12);
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

  describe('keeping the draft in sync with its league', () => {
    const yahooSync = { leagueName: 'HHL', leagueKey: '465.l.9', syncedAt: 'then' };
    const hhl: FollowedLeague = { platform: 'Yahoo', id: '465.l.9', name: 'HHL' };
    /** A finished board that is the league's draft: the user's team seated second of three. */
    const finishedBoard: DraftState = {
      ...leagueBoard,
      picks: [{ playerId: 1, teamId: '465.l.9.t.2' }],
      following: undefined,
      finishedAt: '2026-09-20T00:00:00Z',
    };

    const render = (params: Record<string, unknown> = {}) =>
      MockRender(DraftSetupComponent, {
        initial: finishedBoard,
        seedName: 'My Team',
        league: leagueWith({ leagueSize: 3, yahooSync }),
        boardSyncedFrom: hhl,
        ...params,
      });

    it('saves at once when nothing the league set has changed', () => {
      const fixture = render();
      const component = fixture.point.componentInstance;
      const emitted = confirmedBy(component);

      component.submit();

      expect(component.syncWarning()).toBeNull();
      expect(emitted()?.league.yahooSync).toEqual(yahooSync);
    });

    it('warns before saving scoring the league did not set, and unlinks the league once told to', () => {
      const fixture = render();
      const component = fixture.point.componentInstance;
      const emitted = confirmedBy(component);

      component.setStatWeights({ ...component.editableLeague().statWeights, goals: 9 });
      component.submit();
      fixture.detectChanges();

      expect(emitted()).toBeUndefined();
      expect(component.syncWarning()).toEqual(hhl);
      const dialog = ngMocks.findInstance(SyncWarningDialogComponent);
      expect(dialog.leagueName()).toEqual('HHL');
      expect(dialog.subject()).toEqual('draft');

      component.confirmSyncBreak();

      expect(emitted()?.league.statWeights['goals']).toEqual(9);
      expect(emitted()?.league.yahooSync).toBeUndefined();
      expect(emitted()?.follow).toBe(false);
    });

    it('warns about a changed roster the same way', () => {
      const component = render().point.componentInstance;
      const emitted = confirmedBy(component);

      component.setRosterSlots({ ...DEFAULT_ROSTER_SLOTS, bn: 9 });
      component.submit();

      expect(emitted()).toBeUndefined();
      expect(component.syncWarning()).toEqual(hhl);
    });

    it('goes back to the settings, still linked, when the warning is cancelled', () => {
      const component = render().point.componentInstance;
      const emitted = confirmedBy(component);
      component.setStatWeights({ ...component.editableLeague().statWeights, goals: 9 });
      component.submit();

      component.cancelSyncBreak();

      expect(component.syncWarning()).toBeNull();
      expect(emitted()).toBeUndefined();
      expect(component.editableLeague().yahooSync).toEqual(yahooSync);
      expect(component.editableLeague().statWeights['goals']).toEqual(9);
    });

    it("warns before moving the user's seat on the league's board, and keeps the link", () => {
      const component = render().point.componentInstance;
      const emitted = confirmedBy(component);

      component.setMyPosition(1);
      component.submit();

      expect(component.syncWarning()).toEqual(hhl);
      component.confirmSyncBreak();
      expect(emitted()?.draft.order[0]).toEqual('465.l.9.t.1');
      // The scoring is still the league's: only the board stops naming it.
      expect(emitted()?.league.yahooSync).toEqual(yahooSync);
    });

    it('warns before changing the number of teams on a board linked to its league', () => {
      const component = render({ boardSyncedFrom: null }).point.componentInstance;

      component.setTeamCount(4);
      component.submit();

      // A board that no longer is the league's draft still has the league's settings.
      expect(component.syncWarning()).toEqual(hhl);
    });

    it('lets a board that is not the league draft be reseated without a word', () => {
      const component = render({ boardSyncedFrom: null }).point.componentInstance;
      const emitted = confirmedBy(component);

      component.setMyPosition(1);
      component.submit();

      expect(component.syncWarning()).toBeNull();
      expect(emitted()?.draft.order[0]).toEqual('465.l.9.t.1');
    });

    it('takes a fresh import as the league, not as a change to it', () => {
      const component = render().point.componentInstance;
      const emitted = confirmedBy(component);

      component.applyYahoo({ settings: importOf(3), leagueName: 'HHL', leagueKey: '465.l.9' });
      component.submit();

      expect(component.syncWarning()).toBeNull();
      expect(emitted()?.league.yahooSync?.leagueKey).toEqual('465.l.9');
    });

    it('says nothing for settings with no league behind them', () => {
      const component = render({
        league: leagueWith({ leagueSize: 3 }),
        boardSyncedFrom: null,
      }).point.componentInstance;
      const emitted = confirmedBy(component);

      component.setStatWeights({ ...component.editableLeague().statWeights, goals: 9 });
      component.submit();

      expect(component.syncWarning()).toBeNull();
      expect(emitted()?.league.statWeights['goals']).toEqual(9);
    });
  });
});
