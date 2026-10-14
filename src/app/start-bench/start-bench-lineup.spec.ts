import { describe, expect, it } from 'vitest';
import { PlannerRosterPlayer } from '../api/models/planner-roster-player';
import { RosterSlots } from '../api/models/roster-slots';
import { ScheduledGame } from '../api/models/scheduled-game';
import { TeamSchedule } from '../api/models/team-schedule';
import { teamsByKey } from '../streamer-planner/planner-free-agents';
import { TeamPlayer } from '../services/player-scout.service';
import {
  assignSeats,
  byLineupNow,
  gameLabel,
  makeRoom,
  nowStatus,
  playsTonight,
  startBenchDay,
} from './start-bench-lineup';
import { labelledSeats } from '../streamer-planner/planner-lineup';

const DAY = '2026-10-14';

const SLOTS: RosterSlots = { c: 2, lw: 1, rw: 0, w: 0, f: 0, d: 1, util: 1, g: 1, bn: 4 };

function game(date: string, opponent: string, home = true): ScheduledGame {
  return {
    backToBack: false,
    date,
    goalieWorth: 1,
    home,
    offNight: false,
    opponent,
    opponentGoalsAgainst: 3,
    opponentGoalsFor: 3,
    plusMinusPerMinute: 0,
    skaterWorth: 1,
    statWorth: {},
  };
}

function club(team: string, games: ScheduledGame[]): TeamSchedule {
  return {
    backToBacks: 0,
    games: games.length,
    goalieRank: 1,
    goalieScore: 1,
    homeGames: 0,
    offNightGames: 0,
    schedule: games,
    skaterRank: 1,
    skaterScore: 1,
    team,
  };
}

/** EDM and TOR play on the day; BOS played the day before and not on it. */
const TEAMS = teamsByKey([
  club('EDM', [game(DAY, 'CGY')]),
  club('TOR', [game(DAY, 'MTL', false)]),
  club('BOS', [game('2026-10-13', 'NYR')]),
]);

function player(
  playerId: string,
  positions: string[],
  slot: string,
  teamAbbrev = 'EDM',
  extra: Partial<PlannerRosterPlayer> = {},
): PlannerRosterPlayer {
  return {
    playerId,
    name: `Player ${playerId}`,
    teamAbbrev,
    type: positions.includes('G') ? 'goalie' : 'skater',
    positions,
    slot,
    out: false,
    ...extra,
  };
}

function day(
  roster: PlannerRosterPlayer[],
  scores: Record<string, number>,
  slots: RosterSlots = SLOTS,
  expected: Record<string, number> = {},
) {
  return startBenchDay(
    roster,
    slots,
    TEAMS,
    DAY,
    new Map(Object.entries(scores)),
    new Map(Object.entries(expected)),
  );
}

describe('nowStatus', () => {
  it('reads the bench, reserve and lineup slots as both platforms spell them', () => {
    expect(nowStatus('BN')).toBe('bench');
    expect(nowStatus(null)).toBe('bench');
    expect(nowStatus('IR+')).toBe('reserve');
    expect(nowStatus('NA')).toBe('reserve');
    expect(nowStatus('Util')).toBe('lineup');
    expect(nowStatus('C')).toBe('lineup');
  });
});

describe('startBenchDay', () => {
  it('starts the best centres a full night has, and benches the one left over', () => {
    const result = day(
      [
        player('1', ['C'], 'C'),
        player('2', ['C'], 'C'),
        player('3', ['C'], 'BN'),
        player('4', ['C'], 'Util'),
      ],
      { '1': 5, '2': 1, '3': 4, '4': 3 },
    );

    const byId = new Map(result.rows.map((row) => [row.player.playerId, row]));
    expect(byId.get('1')?.suggested).toBe('C');
    expect(byId.get('3')?.suggested).toBe('C');
    expect(byId.get('4')?.suggested).toBe('Util');
    expect(byId.get('2')?.suggested).toBeNull();
    expect(result.starts.map((row) => row.player.playerId)).toEqual(['3']);
    expect(result.benches.map((row) => row.player.playerId)).toEqual(['2']);
    // Player 3's 4 in for player 2's 1.
    expect(result.gain).toBe(3);
  });

  it('moves a dual-position player to whichever seat leaves room for the others', () => {
    const result = day(
      [player('1', ['C', 'LW'], 'BN'), player('2', ['C'], 'BN'), player('3', ['C'], 'BN')],
      { '1': 5, '2': 4, '3': 3 },
      { c: 2, lw: 1, rw: 0, w: 0, f: 0, d: 0, util: 0, g: 0, bn: 0 },
    );

    expect(result.rows.map((row) => row.suggested)).toEqual(['LW', 'C', 'C']);
  });

  it('never benches a starter with no game or one who is out: he gives nothing either way', () => {
    const result = day(
      [
        player('1', ['C'], 'C', 'BOS'),
        player('2', ['D'], 'D', 'EDM', { out: true, injuryStatus: 'O' }),
        player('3', ['C'], 'BN'),
      ],
      { '1': 9, '2': 9, '3': 2 },
    );

    const byId = new Map(result.rows.map((row) => [row.player.playerId, row]));
    expect(byId.get('1')?.game).toBeNull();
    expect(byId.get('1')?.suggested).toBeNull();
    expect(byId.get('1')?.change).toBeNull();
    expect(byId.get('2')?.change).toBeNull();
    expect(byId.get('3')?.change).toBe('start');
    expect(result.playing).toBe(1);
  });

  it('keeps the player already starting when the model has two level', () => {
    const result = day(
      [player('1', ['D'], 'BN'), player('2', ['D'], 'D')],
      { '1': 2, '2': 2 },
      { c: 0, lw: 0, rw: 0, w: 0, f: 0, d: 1, util: 0, g: 0, bn: 1 },
    );

    expect(result.starts).toEqual([]);
    expect(result.benches).toEqual([]);
  });

  it('seats a player the model has no line for only after everyone it has one for', () => {
    const result = day(
      [player('1', ['D'], 'D'), player('2', ['D'], 'BN'), player('3', ['C'], 'BN')],
      { '2': 0.1 },
      { c: 0, lw: 0, rw: 0, w: 0, f: 0, d: 1, util: 1, g: 0, bn: 2 },
    );

    const byId = new Map(result.rows.map((row) => [row.player.playerId, row]));
    expect(byId.get('2')?.suggested).toBe('D');
    expect(byId.get('2')?.change).toBe('start');
    // Of the two without a line the one already in the lineup keeps the Util seat.
    expect(byId.get('1')?.suggested).toBe('Util');
    expect(byId.get('3')?.suggested).toBeNull();
    // A start with no line would make the difference a guess.
    expect(day([player('4', ['C'], 'BN')], {}).gain).toBeNull();
  });

  it('seats goalies only at G', () => {
    const result = day([player('1', ['G'], 'G'), player('2', ['G'], 'BN', 'TOR')], {
      '1': 1,
      '2': 3,
    });

    const byId = new Map(result.rows.map((row) => [row.player.playerId, row]));
    expect(byId.get('2')?.suggested).toBe('G');
    expect(byId.get('1')?.change).toBe('bench');
  });
});

describe('assignSeats', () => {
  it('puts a centre in a C seat before Util', () => {
    const seats = labelledSeats({ c: 1, lw: 0, rw: 0, w: 0, f: 0, d: 0, util: 1, g: 0, bn: 0 });
    expect(assignSeats([['C'], ['C']], seats).map((seat) => seats[seat ?? 0].label)).toEqual([
      'C',
      'Util',
    ]);
  });
});

describe('byLineupNow', () => {
  it('lists the lineup slot by slot, then the bench by the model, then injured reserve', () => {
    const result = day(
      [
        player('1', ['C'], 'IR+', 'EDM', { out: true }),
        player('2', ['C'], 'BN'),
        player('3', ['G'], 'G'),
        player('4', ['C'], 'C'),
        player('5', ['C'], 'BN'),
      ],
      { '2': 1, '5': 3, '4': 2, '3': 1 },
    );

    expect(byLineupNow(result.rows).map((row) => row.player.playerId)).toEqual([
      '4',
      '3',
      '5',
      '2',
      '1',
    ]);
  });
});

describe('gameLabel', () => {
  it('reads the game from the player’s side', () => {
    expect(gameLabel(game(DAY, 'CGY'))).toBe('vs CGY');
    expect(gameLabel(game(DAY, 'MTL', false))).toBe('@ MTL');
  });
});

describe('playsTonight', () => {
  it('takes the model’s word over a platform that still has a player out', () => {
    const parked = player('1', ['C'], 'IR+', 'EDM', { out: true, injuryStatus: 'IR' });
    expect(playsTonight(parked, 0.95)).toBe(true);
    // A game-time call stays the platform’s.
    expect(playsTonight(parked, 0.3)).toBe(false);
    expect(playsTonight(parked, undefined)).toBe(false);
    // A goalie’s chance is his share of the crease, nought while he is out.
    const goalie = player('2', ['G'], 'IR', 'EDM', { out: true });
    expect(playsTonight(goalie, 0.2)).toBe(true);
    expect(playsTonight(goalie, 0)).toBe(false);
    expect(playsTonight(player('3', ['C'], 'BN'), undefined)).toBe(true);
  });
});

/** Two C, one LW, one D, one Util, one G and a four-player bench, as SLOTS says: 10 spots. */
function rostered(playerId: string, slot: string, extra: Partial<TeamPlayer> = {}): TeamPlayer {
  return {
    playerId,
    name: `Player ${playerId}`,
    teamAbbrev: 'EDM',
    type: 'skater',
    positions: ['C'],
    slot,
    reserve: ['IR', 'IR+', 'NA'].includes(slot),
    reserveEligible: [],
    out: ['IR', 'IR+', 'NA'].includes(slot),
    projection: null,
    ...extra,
  };
}

describe('starting a player cleared to come off injured reserve', () => {
  // Bedard's night: parked on IR+, cleared, and better than a centre in the lineup.
  const roster = [
    player('1', ['C'], 'C'),
    player('2', ['C'], 'C'),
    player('3', ['C'], 'IR+', 'EDM', { out: true, injuryStatus: 'IR' }),
    player('4', ['D'], 'BN', 'BOS'),
    player('5', ['D'], 'BN', 'BOS'),
  ];
  const tonight = day(
    roster,
    { '1': 5, '2': 1, '3': 4 },
    { c: 2, lw: 0, rw: 0, w: 0, f: 0, d: 0, util: 0, g: 0, bn: 2 },
    { '1': 1, '2': 1, '3': 0.95 },
  );

  it('starts him in place of the weaker centre, to be activated first', () => {
    const byId = new Map(tonight.rows.map((row) => [row.player.playerId, row]));
    expect(byId.get('3')?.suggested).toBe('C');
    expect(byId.get('3')?.change).toBe('start');
    expect(byId.get('3')?.activate).toBe(true);
    expect(byId.get('3')?.clearedByModel).toBe(true);
    expect(byId.get('2')?.change).toBe('bench');
    expect(tonight.activations.map((row) => row.player.playerId)).toEqual(['3']);
  });

  const slots: RosterSlots = { c: 2, lw: 0, rw: 0, w: 0, f: 0, d: 0, util: 0, g: 0, bn: 2 };
  const team = [
    rostered('1', 'C'),
    rostered('2', 'C'),
    rostered('3', 'IR+', { injuryStatus: 'IR' }),
    rostered('4', 'BN'),
    rostered('5', 'BN'),
  ];
  // Over the rest of the season player 2 is worth most, then 5, then 4.
  const scores = new Map([
    ['1', 90],
    ['2', 70],
    ['3', 80],
    ['4', 20],
    ['5', 30],
  ]);

  it('drops the player the team loses least by over the rest of the season, never tonight’s starter', () => {
    const room = makeRoom(tonight, team, scores, slots, { 'IR+': 1 });
    expect(room.openSpots).toBe(0);
    expect(room.toReserve).toEqual([]);
    expect(room.drops.map((row) => row.player.playerId)).toEqual(['4']);
    expect(room.short).toBe(0);
  });

  it('drops nobody where the roster has an open spot', () => {
    const room = makeRoom(tonight, team.slice(0, 4), scores, slots, {});
    expect(room.openSpots).toBe(1);
    expect(room.drops).toEqual([]);
  });

  it('moves an injured player into the reserve slot he leaves before dropping anyone', () => {
    const hurt = rostered('4', 'BN', {
      out: true,
      injuryStatus: 'O',
      reserveEligible: ['IR', 'IR+'],
    });
    const room = makeRoom(tonight, [...team.slice(0, 3), hurt, team[4]], scores, slots, {
      'IR+': 1,
    });
    expect(room.toReserve.map((p) => p.playerId)).toEqual(['4']);
    expect(room.drops).toEqual([]);
  });

  it('asks nothing of a night with nobody to activate', () => {
    const room = makeRoom(day(roster.slice(0, 2), { '1': 1, '2': 1 }), team, scores, slots, {});
    expect(room).toEqual({ openSpots: 0, toReserve: [], drops: [], short: 0 });
  });
});
