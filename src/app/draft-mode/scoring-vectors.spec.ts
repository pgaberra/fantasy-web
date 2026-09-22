import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectionRankingService } from '../services/projection-ranking.service';
import { runScoringVectorCase, scoringVectorCases, ScoringVectors } from './scoring-vectors';

const VECTORS_PATH = join(process.cwd(), 'src', 'app', 'draft-mode', 'scoring-vectors.json');

/**
 * The golden vectors that keep the two scoring engines in step. The BFF totals a league for
 * accounts that may not be handed the lines behind the totals, so the same ranking now lives in
 * Java as well; this spec is what stops the two drifting.
 *
 * <p>When it fails after a deliberate change to how a board is scored: regenerate with
 * `UPDATE_SCORING_VECTORS=1 npm test`, then re-pin the file in fantasy-bff
 * (`src/test/resources/scoring/scoring-vectors.json`) in the same change, the way a spec is
 * pinned. A failure with no such change means the scoring moved by accident, which is the
 * whole point of the file.
 */
describe('scoring vectors', () => {
  let ranking: ProjectionRankingService;

  beforeEach(() => {
    ranking = TestBed.inject(ProjectionRankingService);
  });

  it('scores the committed cases exactly as the committed vectors say', () => {
    const produced: ScoringVectors = {
      cases: scoringVectorCases().map((testCase) => ({
        case: testCase,
        expected: runScoringVectorCase(testCase, ranking),
      })),
    };

    if (process.env['UPDATE_SCORING_VECTORS']) {
      writeFileSync(VECTORS_PATH, `${JSON.stringify(produced, null, 2)}\n`, 'utf8');
    }

    const committed = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as ScoringVectors;
    expect(committed.cases.map((entry) => entry.case.name)).toEqual(
      produced.cases.map((entry) => entry.case.name),
    );
    // Compared as JSON so a drift of one cell in one team reads as the cell it is, rather than
    // as two large objects the runner truncates.
    for (const [index, entry] of produced.cases.entries()) {
      expect(JSON.stringify(committed.cases[index].case)).toEqual(JSON.stringify(entry.case));
      expect(JSON.stringify(committed.cases[index].expected, null, 2)).toEqual(
        JSON.stringify(entry.expected, null, 2),
      );
    }
  });

  /**
   * The fixtures are only worth pinning if they exercise the parts that are hard to port: a pool
   * that has to be re-derived from its own scores, ratios weighed by volumes the line does not
   * state, and a lineup where a dual-position player has to yield his named slot.
   */
  it('covers the shapes the port could get wrong', () => {
    const [points, categories] = scoringVectorCases();

    expect(points.league.scoringType).toEqual('points');
    expect(categories.league.scoringType).toEqual('category');
    // The pool the z-scores are measured against is smaller than the player list, so it has to be
    // re-derived rather than taken whole.
    const skaterPool =
      categories.league.leagueSize *
      (categories.league.rosterSlots.c +
        categories.league.rosterSlots.lw +
        categories.league.rosterSlots.rw +
        categories.league.rosterSlots.d +
        categories.league.rosterSlots.util +
        categories.league.rosterSlots.bn);
    expect(skaterPool).toBeLessThan(
      points.pool.filter((player) => player.type === 'skater').length,
    );
    expect(categories.league.activeScoringColumns).toContain('gaa');
    expect(categories.league.activeScoringColumns).toContain('svPct');
    expect(
      points.pool.some((player) => player.type === 'goalie' && player.stats.scoring['toi'] === 0),
    ).toBe(true);
    expect(
      points.pool.some((player) => player.type === 'goalie' && player.stats.scoring['sa'] === 0),
    ).toBe(true);
    expect(
      points.pool.some((player) => player.type === 'skater' && player.stats.scoring['sog'] === 0),
    ).toBe(true);
    expect(points.pool.some((player) => player.positions.length > 1)).toBe(true);
  });
});
