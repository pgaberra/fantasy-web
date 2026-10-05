import { describe, expect, it } from 'vitest';
import { PlannerRosterPlayer } from '../api/models/planner-roster-player';
import { RosterSlots } from '../api/models/roster-slots';
import { TeamSchedule } from '../api/models/team-schedule';
import {
  dropRoomLabel,
  dropRooms,
  dropRoomTip,
  fitsRoom,
  lineupSeats,
  nightRooms,
  roomLabel,
  roomTip,
  seated,
} from './planner-lineup';

const NONE: RosterSlots = { c: 0, lw: 0, rw: 0, w: 0, f: 0, d: 0, util: 0, bn: 0, g: 0 };

function slots(partial: Partial<RosterSlots>): RosterSlots {
  return { ...NONE, ...partial };
}

function club(team: string, dates: readonly string[]): TeamSchedule {
  return {
    team,
    games: dates.length,
    offNightGames: 0,
    backToBacks: 0,
    homeGames: 0,
    skaterScore: 0,
    skaterRank: 1,
    goalieScore: 0,
    goalieRank: 1,
    schedule: dates.map((date) => ({
      date,
      opponent: 'BOS',
      home: true,
      offNight: false,
      backToBack: false,
      opponentGoalsAgainst: 1,
      opponentGoalsFor: 1,
      skaterWorth: 1,
      goalieWorth: 1,
    })),
  };
}

function rostered(
  playerId: string,
  team: string,
  positions: string[],
  out = false,
): PlannerRosterPlayer {
  return {
    playerId,
    name: playerId,
    teamAbbrev: team,
    type: positions.includes('G') ? 'goalie' : 'skater',
    positions,
    out,
  };
}

const MON = '2026-10-12';
const TUE = '2026-10-13';

describe('lineupSeats', () => {
  it('gives each slot its own seat and leaves the bench out', () => {
    const seats = lineupSeats(slots({ c: 2, d: 1, util: 1, bn: 4, g: 1 }));
    expect(seats).toHaveLength(5);
    expect([...seats[4]]).toEqual(['G']);
    expect([...seats[3]]).toEqual(['C', 'LW', 'RW', 'D']);
  });
});

describe('seated', () => {
  it('moves a dual-position player to the seat that leaves room for another', () => {
    // A C/LW listed first must not take the C seat from a pure C behind him.
    const seats = lineupSeats(slots({ c: 1, lw: 1 }));
    expect(seated([['C', 'LW'], ['C']], seats)).toBe(2);
  });

  it('fills the flex seats only with the positions they take', () => {
    const seats = lineupSeats(slots({ w: 1, f: 1 }));
    expect(seated([['D'], ['C'], ['RW']], seats)).toBe(2);
  });
});

describe('nightRooms', () => {
  const teams = new Map([
    ['EDM', club('EDM', [MON, TUE])],
    ['TBL', club('TBL', [MON])],
  ]);

  it('finds the night a D seat is open, even with most of the roster playing', () => {
    const roster = [
      rostered('1', 'EDM', ['C']),
      rostered('2', 'EDM', ['LW', 'RW']),
      rostered('3', 'TB', ['D']),
      rostered('4', 'TB', ['C']),
    ];
    const rooms = nightRooms(roster, slots({ c: 1, lw: 1, d: 2 }), teams, [MON, TUE]);

    const monday = rooms.get(MON)!;
    // Two Cs for one C seat: one sits, and the second D seat stays open.
    expect(monday.playing).toBe(4);
    expect(monday.benched).toBe(1);
    expect(monday.open).toBe(1);
    expect([...monday.fits]).toEqual(['D']);

    const tuesday = rooms.get(TUE)!;
    expect(tuesday.playing).toBe(2);
    expect([...tuesday.fits]).toEqual(['D']);
    expect(tuesday.open).toBe(2);
  });

  it('leaves a player who is out, or on a club without a schedule, off every night', () => {
    const roster = [rostered('1', 'EDM', ['D'], true), rostered('2', 'XYZ', ['D'])];
    const rooms = nightRooms(roster, slots({ d: 1 }), teams, [MON]);
    expect(rooms.get(MON)!.playing).toBe(0);
    expect(rooms.get(MON)!.open).toBe(1);
  });

  it('says a Util seat takes any skater, and a G seat a goalie', () => {
    const rooms = nightRooms([], slots({ util: 1, g: 1 }), teams, [MON]);
    // Every position named outright, rather than "Any skater" for the reader to unpack.
    expect(roomLabel(rooms.get(MON)!)).toBe('C, LW, RW, D, G');
    expect(fitsRoom(['D'], rooms.get(MON))).toBe(true);
    expect(fitsRoom(['G'], rooms.get(MON))).toBe(true);
  });

  it('calls a night with every seat taken full, and a player fits it nowhere', () => {
    const roster = [rostered('1', 'EDM', ['C']), rostered('2', 'EDM', ['C'])];
    const room = nightRooms(roster, slots({ c: 1 }), teams, [MON]).get(MON)!;
    expect(roomLabel(room)).toBe('Full');
    expect(roomTip(room)).toBe('Your lineup is full: 2 of your players play, 1 on the bench.');
    expect(fitsRoom(['C', 'LW'], room)).toBe(false);
    expect(fitsRoom(['C'], undefined)).toBe(false);
  });

  it('names the open seats in its tip', () => {
    const roster = [rostered('1', 'EDM', ['C'])];
    const room = nightRooms(roster, slots({ c: 2, lw: 1 }), teams, [MON]).get(MON)!;
    expect(roomLabel(room)).toBe('C, LW');
    expect(roomTip(room)).toBe('1 of your players plays, 2 slots open. Room for: C, LW.');
  });
});

describe('dropRooms', () => {
  const teams = new Map([
    ['EDM', club('EDM', [MON, TUE])],
    ['TBL', club('TBL', [MON])],
  ]);
  /** A C, a LW and a RW seat, two D seats and a G seat. */
  const SLOTS = slots({ c: 1, lw: 1, rw: 1, d: 2, g: 1 });

  function named(playerId: string, name: string, team: string, positions: string[]) {
    return { ...rostered(playerId, team, positions), name };
  }

  // Monday the forwards are full and one D seat and the G seat are open.
  const roster = [
    named('1', 'Benson', 'EDM', ['LW']),
    named('2', 'Dual', 'EDM', ['C', 'LW']),
    named('3', 'Wing', 'EDM', ['RW', 'C']),
    named('4', 'Back', 'EDM', ['D']),
  ];

  it("opens the dropped player's seat, and what dual-position teammates moving about lets it take", () => {
    const rooms = nightRooms(roster, SLOTS, teams, [MON, TUE]);
    expect(roomLabel(rooms.get(MON)!)).toBe('D, G');

    const opened = dropRooms(roster, SLOTS, teams, rooms, new Set(['1']));

    // Without Benson, Dual can slide to LW and Wing to C, so any forward fills his seat; D and G
    // were open already and are not his to open.
    const monday = opened.get(MON)!;
    expect(dropRoomLabel(monday)).toBe('C, LW, RW');
    expect(dropRoomTip(monday)).toBe(
      'Open only if you drop a player you picked: C, LW, RW if you drop Benson.',
    );
  });

  it('opens nothing when a teammate on the bench takes the seat, or the drop sat anyway', () => {
    const deeper = [...roster, named('5', 'Tampa C', 'TB', ['C'])];
    const rooms = nightRooms(deeper, SLOTS, teams, [MON]);

    // Tampa C sits Monday behind three forwards: Benson's seat is his, and dropping Tampa frees none.
    expect(dropRooms(deeper, SLOTS, teams, rooms, new Set(['1'])).size).toBe(0);
    expect(dropRooms(deeper, SLOTS, teams, rooms, new Set(['5'])).size).toBe(0);
  });

  it('names every drop that opens a position', () => {
    const rooms = nightRooms(roster, SLOTS, teams, [MON]);

    const monday = dropRooms(roster, SLOTS, teams, rooms, new Set(['1', '4'])).get(MON)!;

    expect(monday.get('LW')).toEqual(['Benson']);
    expect(dropRoomTip(monday)).toBe(
      'Open only if you drop a player you picked: C, LW, RW if you drop Benson.',
    );
  });
});
