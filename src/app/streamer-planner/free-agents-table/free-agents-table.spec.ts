import { MockBuilder, MockRender, ngMocks } from 'ng-mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { GOALIE_SCORING_STAT_KEYS, SKATER_SCORING_STAT_KEYS } from '../../models/stat-key.model';
import { TeamLogoComponent } from '../../shared/team-logo/team-logo';
import { FreeAgentGroup, RankedFreeAgent } from '../planner-free-agents';
import { FreeAgentsTableComponent } from './free-agents-table';

function scoringLine<K extends string>(keys: readonly K[], set: Record<string, number>) {
  return keys.reduce(
    (line, key) => ({ ...line, [key]: set[key] ?? 0 }),
    {} as Record<K, number>,
  ) as never;
}

const SKATER: RankedFreeAgent = {
  rank: 1,
  score: 11.25,
  games: 3.75,
  player: {
    playerId: '1',
    name: 'Top Scorer',
    teamAbbrev: 'EDM',
    positions: ['C', 'LW'],
    availability: 'FREE_AGENT',
    clubGames: 4,
    expectedGames: 3.75,
    projection: {
      type: 'skater',
      playerId: 1,
      stats: {
        scoring: scoringLine(SKATER_SCORING_STAT_KEYS, { goals: 2.1, assists: 3, sog: 11.2 }),
        utility: { gp: 3.75, toiPerGame: 1052 },
      },
    },
  },
};

const GOALIE: RankedFreeAgent = {
  rank: 2,
  score: 4,
  games: 2,
  player: {
    playerId: '2',
    name: 'Waiver Goalie',
    teamAbbrev: 'TB',
    positions: ['G'],
    availability: 'WAIVERS',
    clubGames: 3,
    expectedGames: 2,
    projection: {
      type: 'goalie',
      playerId: 2,
      stats: {
        scoring: scoringLine(GOALIE_SCORING_STAT_KEYS, { w: 1.4, sv: 57.4, svPct: 0.908 }),
        utility: { gp: 2 },
      },
    },
  },
};

const GROUPS: FreeAgentGroup[] = [
  { position: 'C', rows: [SKATER] },
  { position: 'G', rows: [GOALIE] },
];

describe('FreeAgentsTableComponent', () => {
  beforeEach(() => MockBuilder(FreeAgentsTableComponent));

  function render(scoringType: 'points' | 'category' = 'points') {
    const fixture = MockRender(FreeAgentsTableComponent, { groups: GROUPS, scoringType });
    fixture.detectChanges();
    return fixture;
  }

  it('writes each position as a band with its players under it', () => {
    const fixture = render();
    const bands = ngMocks.findAll(fixture, '.group-row');

    expect(bands.map((band) => ngMocks.formatText(band))).toEqual(['C', 'G']);
    expect(ngMocks.formatText(fixture)).toContain('Top Scorer');
    expect(ngMocks.formatText(fixture)).toContain('Waiver Goalie');
  });

  it("writes the score the way the league's scoring is written, with the rate a game", () => {
    const fixture = render();
    const table = fixture.point.componentInstance;

    expect(table.scoreHeading()).toBe('Proj. pts');
    expect(table.score(SKATER)).toBe('11.3');
    expect(table.perGame(SKATER)).toBe('3.0/gm');

    const category = render('category');
    expect(category.point.componentInstance.scoreHeading()).toBe('Z-Score');
    expect(category.point.componentInstance.score(SKATER)).toBe('11.25');
  });

  it('gives a skater his ice time and his line, and a goalie his own', () => {
    const fixture = render();
    const table = fixture.point.componentInstance;

    expect(table.toi(SKATER)).toBe('17:32');
    expect(table.toi(GOALIE)).toBe('');
    expect(table.line(SKATER)).toEqual(['2.1 G', '3.0 A', '11.2 SOG']);
    expect(table.line(GOALIE)).toEqual(['1.4 W', '57 SV', '0.908 SV%']);
    expect(table.games(SKATER)).toBe('3.8');
  });

  // The crest already says which club; the abbreviation beside it said it twice.
  it('names the club by its crest alone, which then carries the name for a screen reader', () => {
    const fixture = render();
    const logos = ngMocks.findAll(fixture, TeamLogoComponent);

    expect(logos.map((logo) => ngMocks.input(logo, 'alt'))).toEqual(['EDM', 'TB']);
    expect(ngMocks.formatText(ngMocks.findAll(fixture, '.player-head')[0])).toBe('Top Scorer');
  });

  // An add is what the list is a list of; only a claim changes what the reader does next.
  it('tags a player on waivers and nobody else', () => {
    const fixture = render();
    const tags = ngMocks.findAll(fixture, '.player-status');

    expect(tags.length).toBe(1);
    expect(ngMocks.formatText(tags[0])).toBe('Waivers');
    expect(ngMocks.formatText(ngMocks.findAll(fixture, 'tbody tr')[1])).not.toContain('Free agent');
  });
});
