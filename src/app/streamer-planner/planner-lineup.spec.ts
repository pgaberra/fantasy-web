import { describe, expect, it } from 'vitest';
import { PlannerRosterPlayer } from '../api/models/planner-roster-player';
import { RosterSlots } from '../api/models/roster-slots';
import { TeamSchedule } from '../api/models/team-schedule';
import {
  dropOpeningLabel,
  dropOpeningTip,
  dropRooms,
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

  it('lists each kind of drop with what it opens, dual-position teammates moved about', () => {
    const rooms = nightRooms(roster, SLOTS, teams, [MON, TUE]);
    expect(roomLabel(rooms.get(MON)!)).toBe('D, G');

    const monday = dropRooms(roster, SLOTS, teams, rooms).get(MON)!;

    // Without Benson, Dual can slide to C and Wing to RW or C, so any forward fills his seat.
    // Without Dual, Benson cannot leave LW: only the C or the RW Wing leaves is open. Without
    // Wing, nobody else plays RW. D and G were open already and are nobody's to open, and
    // dropping Back opens nothing new. In lineup order: C/LW, C/RW, LW.
    expect(monday.map(dropOpeningLabel)).toEqual(['C/LW → C, RW', 'C/RW → RW', 'LW → C, LW, RW']);
    expect(dropOpeningTip(monday[2])).toBe('Drop Benson (LW): room for C, LW or RW.');
  });

  it('opens nothing when a teammate on the bench takes the seat', () => {
    const deeper = [...roster, named('5', 'Tampa C', 'TB', ['C'])];
    const rooms = nightRooms(deeper, SLOTS, teams, [MON]);

    // Tampa C sits Monday behind three forwards: Benson's seat or Dual's is his, and dropping
    // him frees none. Only Wing's RW is nobody else's.
    expect(dropRooms(deeper, SLOTS, teams, rooms).get(MON)!.map(dropOpeningLabel)).toEqual([
      'C/RW → RW',
    ]);
  });

  it('lists together the kinds whose drop opens the same, every player of them named', () => {
    const utility = [
      named('1', 'Centre', 'EDM', ['C']),
      named('2', 'Other C', 'EDM', ['C']),
      named('3', 'Back', 'EDM', ['D']),
    ];
    const util = slots({ util: 3 });
    const rooms = nightRooms(utility, util, teams, [MON]);

    const monday = dropRooms(utility, util, teams, rooms).get(MON)!;

    expect(monday.map(dropOpeningLabel)).toEqual(['C, D → C, LW, RW, D']);
    expect(dropOpeningTip(monday[0])).toBe(
      'Drop Centre, Other C or Back (C or D): room for C, LW, RW or D.',
    );
  });

  it('has nothing for a night no drop opens anything on', () => {
    // One LW seat, two LWs: whichever goes, the other takes the seat.
    const wings = [named('1', 'Benson', 'EDM', ['LW']), named('2', 'Kane', 'EDM', ['LW'])];
    const one = slots({ lw: 1 });
    const rooms = nightRooms(wings, one, teams, [MON]);
    expect(dropRooms(wings, one, teams, rooms).size).toBe(0);
  });
});
